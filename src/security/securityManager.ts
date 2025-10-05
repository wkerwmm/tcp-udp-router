import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'
import { ErrorHandler, RouterError, ErrorType, ErrorSeverity } from '../core/errorHandler'

export interface IPRule {
  address: string
  cidr?: string
  type: 'whitelist' | 'blacklist'
  description?: string
  createdAt: Date
  expiresAt?: Date
}

export interface RateLimitRule {
  identifier: string // IP address or session ID
  windowMs: number
  maxRequests: number
  currentRequests: number
  resetTime: number
  blocked: boolean
  blockDurationMs?: number
}

export interface SecurityConfig {
  enableIPFiltering: boolean
  enableRateLimiting: boolean
  enableHealthCheckAuth: boolean
  healthCheckSecret?: string
  defaultRateLimit: {
    windowMs: number
    maxRequests: number
  }
  ipRules: IPRule[]
  rateLimitRules: Map<string, RateLimitRule>
  maxConnectionsPerIP: number
  connectionTimeouts: {
    tcp: number
    udp: number
  }
}

export class SecurityManager {
  private config: SecurityConfig
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private errorHandler: ErrorHandler
  private ipConnections: Map<string, number>
  private rateLimitCache: Map<string, RateLimitRule>
  private blockedIPs: Set<string>
  private cleanupInterval?: NodeJS.Timeout

  constructor(
    logger: StructuredLogger,
    metrics?: MetricsCollector,
    errorHandler?: ErrorHandler,
    config?: Partial<SecurityConfig>
  ) {
    this.logger = logger
    this.metrics = metrics
    this.errorHandler = errorHandler || new ErrorHandler(logger, metrics)
    this.ipConnections = new Map()
    this.rateLimitCache = new Map()
    this.blockedIPs = new Set()
    
    this.config = {
      enableIPFiltering: true,
      enableRateLimiting: true,
      enableHealthCheckAuth: false,
      defaultRateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 100
      },
      ipRules: [],
      rateLimitRules: new Map(),
      maxConnectionsPerIP: 10,
      connectionTimeouts: {
        tcp: 30000,
        udp: 30000
      },
      ...config
    }

    this.startCleanupInterval()
  }

  async checkIPAccess(ipAddress: string): Promise<boolean> {
    if (!this.config.enableIPFiltering) {
      return true
    }

    try {
      // Check if IP is blocked
      if (this.blockedIPs.has(ipAddress)) {
        this.logger.warn('Blocked IP attempted access', { ipAddress })
        this.metrics?.incrementError('blocked_ip_access', 'security_manager')
        return false
      }

      // Check IP rules
      const now = new Date()
      const activeRules = this.config.ipRules.filter(rule => 
        !rule.expiresAt || rule.expiresAt > now
      )

      for (const rule of activeRules) {
        if (this.matchesIPRule(ipAddress, rule)) {
          if (rule.type === 'blacklist') {
            this.logger.warn('IP blocked by blacklist rule', { 
              ipAddress, 
              rule: rule.description || rule.address 
            })
            this.metrics?.incrementError('blacklist_blocked', 'security_manager')
            return false
          } else if (rule.type === 'whitelist') {
            this.logger.debug('IP allowed by whitelist rule', { 
              ipAddress, 
              rule: rule.description || rule.address 
            })
            return true
          }
        }
      }

      // If whitelist rules exist and IP doesn't match any, block it
      const hasWhitelistRules = activeRules.some(rule => rule.type === 'whitelist')
      if (hasWhitelistRules) {
        this.logger.warn('IP not in whitelist', { ipAddress })
        this.metrics?.incrementError('whitelist_blocked', 'security_manager')
        return false
      }

      return true
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        component: 'security_manager',
        operation: 'check_ip_access',
        additionalData: { ipAddress }
      })
      return false
    }
  }

  async checkRateLimit(identifier: string, protocol: string): Promise<boolean> {
    if (!this.config.enableRateLimiting) {
      return true
    }

    try {
      const now = Date.now()
      let rule = this.rateLimitCache.get(identifier)

      // Create new rule if doesn't exist
      if (!rule) {
        rule = {
          identifier,
          windowMs: this.config.defaultRateLimit.windowMs,
          maxRequests: this.config.defaultRateLimit.maxRequests,
          currentRequests: 0,
          resetTime: now + this.config.defaultRateLimit.windowMs,
          blocked: false
        }
        this.rateLimitCache.set(identifier, rule)
      }

      // Reset if window has expired
      if (now > rule.resetTime) {
        rule.currentRequests = 0
        rule.resetTime = now + rule.windowMs
        rule.blocked = false
      }

      // Check if currently blocked
      if (rule.blocked) {
        this.logger.warn('Rate limit exceeded, request blocked', {
          identifier,
          protocol,
          currentRequests: rule.currentRequests,
          maxRequests: rule.maxRequests
        })
        this.metrics?.incrementError('rate_limit_exceeded', 'security_manager')
        return false
      }

      // Increment request count
      rule.currentRequests++

      // Check if limit exceeded
      if (rule.currentRequests > rule.maxRequests) {
        rule.blocked = true
        if (rule.blockDurationMs) {
          setTimeout(() => {
            rule!.blocked = false
          }, rule.blockDurationMs)
        }
        
        this.logger.warn('Rate limit exceeded', {
          identifier,
          protocol,
          currentRequests: rule.currentRequests,
          maxRequests: rule.maxRequests
        })
        this.metrics?.incrementError('rate_limit_exceeded', 'security_manager')
        return false
      }

      this.logger.debug('Rate limit check passed', {
        identifier,
        protocol,
        currentRequests: rule.currentRequests,
        maxRequests: rule.maxRequests
      })

      return true
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        component: 'security_manager',
        operation: 'check_rate_limit',
        additionalData: { identifier, protocol }
      })
      return false
    }
  }

  async checkConnectionLimit(ipAddress: string): Promise<boolean> {
    try {
      const currentConnections = this.ipConnections.get(ipAddress) || 0
      
      if (currentConnections >= this.config.maxConnectionsPerIP) {
        this.logger.warn('Connection limit exceeded for IP', {
          ipAddress,
          currentConnections,
          maxConnections: this.config.maxConnectionsPerIP
        })
        this.metrics?.incrementError('connection_limit_exceeded', 'security_manager')
        return false
      }

      this.ipConnections.set(ipAddress, currentConnections + 1)
      return true
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        component: 'security_manager',
        operation: 'check_connection_limit',
        additionalData: { ipAddress }
      })
      return false
    }
  }

  releaseConnection(ipAddress: string): void {
    try {
      const currentConnections = this.ipConnections.get(ipAddress) || 0
      if (currentConnections > 0) {
        this.ipConnections.set(ipAddress, currentConnections - 1)
      } else {
        this.ipConnections.delete(ipAddress)
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        component: 'security_manager',
        operation: 'release_connection',
        additionalData: { ipAddress }
      })
    }
  }

  validateHealthCheckAuth(token?: string): boolean {
    if (!this.config.enableHealthCheckAuth) {
      return true
    }

    if (!this.config.healthCheckSecret) {
      this.logger.warn('Health check authentication enabled but no secret configured')
      return false
    }

    return token === this.config.healthCheckSecret
  }

  addIPRule(rule: Omit<IPRule, 'createdAt'>): void {
    const newRule: IPRule = {
      ...rule,
      createdAt: new Date()
    }
    
    this.config.ipRules.push(newRule)
    this.logger.info('IP rule added', {
      address: rule.address,
      type: rule.type,
      description: rule.description
    })
  }

  removeIPRule(address: string, type: 'whitelist' | 'blacklist'): boolean {
    const index = this.config.ipRules.findIndex(
      rule => rule.address === address && rule.type === type
    )
    
    if (index !== -1) {
      this.config.ipRules.splice(index, 1)
      this.logger.info('IP rule removed', { address, type })
      return true
    }
    
    return false
  }

  blockIP(ipAddress: string, durationMs?: number): void {
    this.blockedIPs.add(ipAddress)
    this.logger.warn('IP blocked', { ipAddress, durationMs })
    
    if (durationMs) {
      setTimeout(() => {
        this.unblockIP(ipAddress)
      }, durationMs)
    }
  }

  unblockIP(ipAddress: string): void {
    this.blockedIPs.delete(ipAddress)
    this.logger.info('IP unblocked', { ipAddress })
  }

  setRateLimit(identifier: string, maxRequests: number, windowMs: number): void {
    const rule = this.rateLimitCache.get(identifier)
    if (rule) {
      rule.maxRequests = maxRequests
      rule.windowMs = windowMs
    } else {
      this.rateLimitCache.set(identifier, {
        identifier,
        windowMs,
        maxRequests,
        currentRequests: 0,
        resetTime: Date.now() + windowMs,
        blocked: false
      })
    }
    
    this.logger.info('Rate limit updated', { identifier, maxRequests, windowMs })
  }

  private matchesIPRule(ipAddress: string, rule: IPRule): boolean {
    if (rule.cidr) {
      return this.isIPInCIDR(ipAddress, rule.cidr)
    }
    return ipAddress === rule.address
  }

  private isIPInCIDR(ipAddress: string, cidr: string): boolean {
    // Simple CIDR matching - in production, use a proper CIDR library
    const [network, prefixLength] = cidr.split('/')
    const prefix = parseInt(prefixLength, 10)
    
    // This is a simplified implementation
    // For production, use a library like 'ip-cidr'
    return ipAddress.startsWith(network.split('.').slice(0, Math.floor(prefix / 8)).join('.'))
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRules()
      this.cleanupRateLimitCache()
    }, 60000) // Clean up every minute
  }

  private cleanupExpiredRules(): void {
    const now = new Date()
    const initialCount = this.config.ipRules.length
    
    this.config.ipRules = this.config.ipRules.filter(rule => 
      !rule.expiresAt || rule.expiresAt > now
    )
    
    const removedCount = initialCount - this.config.ipRules.length
    if (removedCount > 0) {
      this.logger.debug('Cleaned up expired IP rules', { removedCount })
    }
  }

  private cleanupRateLimitCache(): void {
    const now = Date.now()
    let removedCount = 0
    
    for (const [identifier, rule] of this.rateLimitCache) {
      if (now > rule.resetTime && rule.currentRequests === 0) {
        this.rateLimitCache.delete(identifier)
        removedCount++
      }
    }
    
    if (removedCount > 0) {
      this.logger.debug('Cleaned up expired rate limit rules', { removedCount })
    }
  }

  getSecurityStats(): {
    blockedIPs: number
    activeConnections: number
    rateLimitRules: number
    ipRules: number
  } {
    return {
      blockedIPs: this.blockedIPs.size,
      activeConnections: Array.from(this.ipConnections.values()).reduce((sum, count) => sum + count, 0),
      rateLimitRules: this.rateLimitCache.size,
      ipRules: this.config.ipRules.length
    }
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    this.ipConnections.clear()
    this.rateLimitCache.clear()
    this.blockedIPs.clear()
    
    this.logger.info('Security manager disposed')
  }
}

export function createSecurityManager(
  logger: StructuredLogger,
  metrics?: MetricsCollector,
  errorHandler?: ErrorHandler,
  config?: Partial<SecurityConfig>
): SecurityManager {
  return new SecurityManager(logger, metrics, errorHandler, config)
}