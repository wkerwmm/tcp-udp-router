import { BasePlugin, PluginContext, PluginConfig, PluginMetadata } from '../pluginAPI'

export interface RateLimitingPluginConfig extends PluginConfig {
  settings: {
    enabled: boolean
    windowMs: number
    maxRequests: number
    blockDurationMs: number
    keyGenerator: 'ip' | 'session' | 'ip-session'
    skipSuccessfulRequests: boolean
    skipFailedRequests: boolean
  }
}

interface RateLimitEntry {
  count: number
  resetTime: number
  blocked: boolean
  blockUntil?: number
}

export class RateLimitingPlugin extends BasePlugin {
  private rateLimitMap = new Map<string, RateLimitEntry>()
  private cleanupInterval?: NodeJS.Timeout

  async onInitialize(): Promise<void> {
    this.log('info', 'Rate limiting plugin initialized', {
      windowMs: this.getSetting('windowMs'),
      maxRequests: this.getSetting('maxRequests'),
      keyGenerator: this.getSetting('keyGenerator')
    })

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries()
    }, 60000) // Clean up every minute
  }

  async onStart(): Promise<void> {
    this.log('info', 'Rate limiting plugin started')
  }

  async onStop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.log('info', 'Rate limiting plugin stopped')
  }

  async onError(error: Error): Promise<void> {
    this.log('error', 'Rate limiting plugin error', {
      error: error.message,
      stack: error.stack
    })
  }

  async process(context: PluginContext): Promise<PluginContext | null> {
    if (!this.getSetting('enabled', true)) {
      return context
    }

    const key = this.generateKey(context)
    const now = Date.now()
    const windowMs = this.getSetting('windowMs', 60000)
    const maxRequests = this.getSetting('maxRequests', 100)
    const blockDurationMs = this.getSetting('blockDurationMs', 300000) // 5 minutes

    let entry = this.rateLimitMap.get(key)
    
    if (!entry) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
        blocked: false
      }
      this.rateLimitMap.set(key, entry)
    }

    // Check if currently blocked
    if (entry.blocked && entry.blockUntil && now < entry.blockUntil) {
      this.log('warn', 'Request blocked by rate limit', {
        sessionId: context.sessionId,
        key,
        blockUntil: new Date(entry.blockUntil).toISOString()
      })
      
      this.incrementCounter('rate_limit_blocked', { key })
      return null // Block the request
    }

    // Reset if window has expired
    if (now > entry.resetTime) {
      entry.count = 0
      entry.resetTime = now + windowMs
      entry.blocked = false
      delete entry.blockUntil
    }

    // Increment request count
    entry.count++

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      entry.blocked = true
      entry.blockUntil = now + blockDurationMs
      
      this.log('warn', 'Rate limit exceeded, blocking requests', {
        sessionId: context.sessionId,
        key,
        count: entry.count,
        maxRequests,
        blockDurationMs,
        blockUntil: new Date(entry.blockUntil).toISOString()
      })
      
      this.incrementCounter('rate_limit_exceeded', { key })
      return null // Block the request
    }

    this.log('debug', 'Rate limit check passed', {
      sessionId: context.sessionId,
      key,
      count: entry.count,
      maxRequests,
      resetTime: new Date(entry.resetTime).toISOString()
    })

    this.incrementCounter('rate_limit_allowed', { key })
    return context
  }

  private generateKey(context: PluginContext): string {
    const keyGenerator = this.getSetting('keyGenerator', 'ip')
    
    switch (keyGenerator) {
      case 'ip':
        return context.remoteAddress
      case 'session':
        return context.sessionId
      case 'ip-session':
        return `${context.remoteAddress}:${context.sessionId}`
      default:
        return context.remoteAddress
    }
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now()
    let removedCount = 0

    for (const [key, entry] of this.rateLimitMap) {
      if (now > entry.resetTime && entry.count === 0) {
        this.rateLimitMap.delete(key)
        removedCount++
      }
    }

    if (removedCount > 0) {
      this.log('debug', 'Cleaned up expired rate limit entries', { removedCount })
    }
  }

  getRateLimitStats(): {
    totalKeys: number
    blockedKeys: number
    activeKeys: number
  } {
    const now = Date.now()
    let blockedKeys = 0
    let activeKeys = 0

    for (const entry of this.rateLimitMap.values()) {
      if (entry.blocked && entry.blockUntil && now < entry.blockUntil) {
        blockedKeys++
      } else if (entry.count > 0) {
        activeKeys++
      }
    }

    return {
      totalKeys: this.rateLimitMap.size,
      blockedKeys,
      activeKeys
    }
  }

  resetRateLimit(key: string): boolean {
    return this.rateLimitMap.delete(key)
  }

  resetAllRateLimits(): void {
    this.rateLimitMap.clear()
    this.log('info', 'All rate limits reset')
  }
}

export const rateLimitingPluginMetadata: PluginMetadata = {
  name: 'rate_limiting',
  version: '1.0.0',
  description: 'Rate limiting plugin with configurable windows and limits',
  author: 'TCP/UDP Router Team',
  license: 'MIT',
  configSchema: {
    enabled: {
      type: 'boolean',
      default: true,
      description: 'Whether rate limiting is enabled'
    },
    windowMs: {
      type: 'number',
      default: 60000,
      description: 'Time window in milliseconds'
    },
    maxRequests: {
      type: 'number',
      default: 100,
      description: 'Maximum requests per window'
    },
    blockDurationMs: {
      type: 'number',
      default: 300000,
      description: 'Duration to block requests after limit exceeded (ms)'
    },
    keyGenerator: {
      type: 'string',
      enum: ['ip', 'session', 'ip-session'],
      default: 'ip',
      description: 'How to generate rate limit keys'
    },
    skipSuccessfulRequests: {
      type: 'boolean',
      default: false,
      description: 'Whether to skip counting successful requests'
    },
    skipFailedRequests: {
      type: 'boolean',
      default: false,
      description: 'Whether to skip counting failed requests'
    }
  }
}