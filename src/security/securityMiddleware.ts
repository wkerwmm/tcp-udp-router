import { SecurityManager } from './securityManager'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export interface SecurityContext {
  sessionId: string
  protocol: string
  remoteAddress: string
  remotePort: number
  data: Buffer
  socket?: any
  rinfo?: any
  server?: any
}

export interface SecurityMiddleware {
  name: string
  process(context: SecurityContext): Promise<boolean>
}

export class IPFilterMiddleware implements SecurityMiddleware {
  public readonly name = 'ip_filter'
  private securityManager: SecurityManager
  private logger: StructuredLogger
  private metrics?: MetricsCollector

  constructor(securityManager: SecurityManager, logger: StructuredLogger, metrics?: MetricsCollector) {
    this.securityManager = securityManager
    this.logger = logger
    this.metrics = metrics
  }

  async process(context: SecurityContext): Promise<boolean> {
    try {
      const allowed = await this.securityManager.checkIPAccess(context.remoteAddress)
      
      if (!allowed) {
        this.logger.warn('IP access denied', {
          sessionId: context.sessionId,
          protocol: context.protocol,
          remoteAddress: context.remoteAddress,
          remotePort: context.remotePort
        })
        
        this.metrics?.incrementError('ip_access_denied', 'security_middleware')
        return false
      }

      this.logger.debug('IP access allowed', {
        sessionId: context.sessionId,
        remoteAddress: context.remoteAddress
      })

      return true
    } catch (error) {
      this.logger.error('IP filter middleware error', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.metrics?.incrementError('ip_filter_error', 'security_middleware')
      return false
    }
  }
}

export class RateLimitMiddleware implements SecurityMiddleware {
  public readonly name = 'rate_limit'
  private securityManager: SecurityManager
  private logger: StructuredLogger
  private metrics?: MetricsCollector

  constructor(securityManager: SecurityManager, logger: StructuredLogger, metrics?: MetricsCollector) {
    this.securityManager = securityManager
    this.logger = logger
    this.metrics = metrics
  }

  async process(context: SecurityContext): Promise<boolean> {
    try {
      const identifier = `${context.remoteAddress}:${context.protocol}`
      const allowed = await this.securityManager.checkRateLimit(identifier, context.protocol)
      
      if (!allowed) {
        this.logger.warn('Rate limit exceeded', {
          sessionId: context.sessionId,
          protocol: context.protocol,
          remoteAddress: context.remoteAddress,
          remotePort: context.remotePort,
          identifier
        })
        
        this.metrics?.incrementError('rate_limit_exceeded', 'security_middleware')
        return false
      }

      this.logger.debug('Rate limit check passed', {
        sessionId: context.sessionId,
        identifier
      })

      return true
    } catch (error) {
      this.logger.error('Rate limit middleware error', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.metrics?.incrementError('rate_limit_error', 'security_middleware')
      return false
    }
  }
}

export class ConnectionLimitMiddleware implements SecurityMiddleware {
  public readonly name = 'connection_limit'
  private securityManager: SecurityManager
  private logger: StructuredLogger
  private metrics?: MetricsCollector

  constructor(securityManager: SecurityManager, logger: StructuredLogger, metrics?: MetricsCollector) {
    this.securityManager = securityManager
    this.logger = logger
    this.metrics = metrics
  }

  async process(context: SecurityContext): Promise<boolean> {
    try {
      // Only check for new connections (when session is being created)
      if (context.protocol === 'tcp' && context.socket) {
        const allowed = await this.securityManager.checkConnectionLimit(context.remoteAddress)
        
        if (!allowed) {
          this.logger.warn('Connection limit exceeded', {
            sessionId: context.sessionId,
            protocol: context.protocol,
            remoteAddress: context.remoteAddress,
            remotePort: context.remotePort
          })
          
          this.metrics?.incrementError('connection_limit_exceeded', 'security_middleware')
          return false
        }
      }

      this.logger.debug('Connection limit check passed', {
        sessionId: context.sessionId,
        remoteAddress: context.remoteAddress
      })

      return true
    } catch (error) {
      this.logger.error('Connection limit middleware error', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.metrics?.incrementError('connection_limit_error', 'security_middleware')
      return false
    }
  }
}

export class SecurityPipeline {
  private middlewares: SecurityMiddleware[]
  private logger: StructuredLogger
  private metrics?: MetricsCollector

  constructor(logger: StructuredLogger, metrics?: MetricsCollector) {
    this.middlewares = []
    this.logger = logger
    this.metrics = metrics
  }

  addMiddleware(middleware: SecurityMiddleware): void {
    this.middlewares.push(middleware)
    this.logger.debug('Security middleware added', { name: middleware.name })
  }

  removeMiddleware(name: string): boolean {
    const index = this.middlewares.findIndex(m => m.name === name)
    if (index !== -1) {
      this.middlewares.splice(index, 1)
      this.logger.debug('Security middleware removed', { name })
      return true
    }
    return false
  }

  async process(context: SecurityContext): Promise<boolean> {
    try {
      for (const middleware of this.middlewares) {
        const allowed = await middleware.process(context)
        if (!allowed) {
          this.logger.warn('Security check failed', {
            sessionId: context.sessionId,
            middleware: middleware.name,
            remoteAddress: context.remoteAddress
          })
          
          this.metrics?.incrementError('security_check_failed', middleware.name)
          return false
        }
      }

      this.logger.debug('All security checks passed', {
        sessionId: context.sessionId,
        remoteAddress: context.remoteAddress
      })

      return true
    } catch (error) {
      this.logger.error('Security pipeline error', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.metrics?.incrementError('security_pipeline_error', 'security_pipeline')
      return false
    }
  }

  getMiddlewares(): string[] {
    return this.middlewares.map(m => m.name)
  }
}

export function createSecurityPipeline(
  securityManager: SecurityManager,
  logger: StructuredLogger,
  metrics?: MetricsCollector
): SecurityPipeline {
  const pipeline = new SecurityPipeline(logger, metrics)
  
  // Add default middlewares
  pipeline.addMiddleware(new IPFilterMiddleware(securityManager, logger, metrics))
  pipeline.addMiddleware(new RateLimitMiddleware(securityManager, logger, metrics))
  pipeline.addMiddleware(new ConnectionLimitMiddleware(securityManager, logger, metrics))
  
  return pipeline
}