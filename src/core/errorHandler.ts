import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export enum ErrorType {
  CONNECTION_ERROR = 'connection_error',
  TIMEOUT_ERROR = 'timeout_error',
  PROCESSING_ERROR = 'processing_error',
  RESOURCE_ERROR = 'resource_error',
  PLUGIN_ERROR = 'plugin_error',
  NETWORK_ERROR = 'network_error',
  VALIDATION_ERROR = 'validation_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  sessionId?: string
  protocol?: string
  remoteAddress?: string
  remotePort?: number
  component?: string
  operation?: string
  additionalData?: Record<string, any>
}

export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  retryableErrors: ErrorType[]
}

export class RouterError extends Error {
  public readonly type: ErrorType
  public readonly severity: ErrorSeverity
  public readonly context: ErrorContext
  public readonly retryable: boolean
  public readonly timestamp: Date
  public readonly originalError?: Error

  constructor(
    message: string,
    type: ErrorType,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    retryable: boolean = false,
    originalError?: Error
  ) {
    super(message)
    this.name = 'RouterError'
    this.type = type
    this.severity = severity
    this.context = context
    this.retryable = retryable
    this.timestamp = new Date()
    this.originalError = originalError

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RouterError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      context: this.context,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    }
  }
}

export class ErrorHandler {
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private retryConfig: RetryConfig
  private errorCounts: Map<ErrorType, number>
  private lastErrorTime: Map<ErrorType, Date>

  constructor(logger: StructuredLogger, metrics?: MetricsCollector, retryConfig?: Partial<RetryConfig>) {
    this.logger = logger
    this.metrics = metrics
    this.errorCounts = new Map()
    this.lastErrorTime = new Map()
    
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: [ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR, ErrorType.CONNECTION_ERROR],
      ...retryConfig
    }
  }

  handleError(error: Error | RouterError, context: ErrorContext = {}): void {
    const routerError = error instanceof RouterError ? error : this.wrapError(error, context)
    
    // Update error counts and timing
    this.updateErrorStats(routerError)
    
    // Record metrics
    this.metrics?.incrementError(routerError.type, routerError.context.component || 'unknown')
    
    // Log based on severity
    this.logError(routerError)
    
    // Handle critical errors
    if (routerError.severity === ErrorSeverity.CRITICAL) {
      this.handleCriticalError(routerError)
    }
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {},
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig }
    let lastError: Error | RouterError | undefined

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        const routerError = error instanceof RouterError ? error : this.wrapError(error, context)
        
        // Check if error is retryable
        if (attempt === config.maxRetries || !this.shouldRetry(routerError, config)) {
          this.handleError(routerError)
          throw routerError
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        )

        this.logger.warn('Retrying operation after error', {
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          delay,
          errorType: routerError.type,
          context: routerError.context
        })

        await this.sleep(delay)
      }
    }

    throw lastError
  }

  private wrapError(error: Error, context: ErrorContext): RouterError {
    let type = ErrorType.UNKNOWN_ERROR
    let severity = ErrorSeverity.MEDIUM
    let retryable = false

    // Determine error type and severity based on error characteristics
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      type = ErrorType.TIMEOUT_ERROR
      severity = ErrorSeverity.MEDIUM
      retryable = true
    } else if (error.name === 'ECONNREFUSED' || error.message.includes('connection')) {
      type = ErrorType.CONNECTION_ERROR
      severity = ErrorSeverity.HIGH
      retryable = true
    } else if (error.name === 'ENOTFOUND' || error.message.includes('network')) {
      type = ErrorType.NETWORK_ERROR
      severity = ErrorSeverity.HIGH
      retryable = true
    } else if (error.message.includes('plugin')) {
      type = ErrorType.PLUGIN_ERROR
      severity = ErrorSeverity.MEDIUM
      retryable = false
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
      type = ErrorType.VALIDATION_ERROR
      severity = ErrorSeverity.LOW
      retryable = false
    }

    return new RouterError(
      error.message,
      type,
      severity,
      context,
      retryable,
      error
    )
  }

  private shouldRetry(error: RouterError, config: RetryConfig): boolean {
    return error.retryable && config.retryableErrors.includes(error.type)
  }

  private updateErrorStats(error: RouterError): void {
    const currentCount = this.errorCounts.get(error.type) || 0
    this.errorCounts.set(error.type, currentCount + 1)
    this.lastErrorTime.set(error.type, new Date())
  }

  private logError(error: RouterError): void {
    const logData = {
      errorType: error.type,
      severity: error.severity,
      retryable: error.retryable,
      context: error.context,
      stack: error.stack,
      originalError: error.originalError?.message
    }

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error('Critical error occurred', logData)
        break
      case ErrorSeverity.HIGH:
        this.logger.error('High severity error occurred', logData)
        break
      case ErrorSeverity.MEDIUM:
        this.logger.warn('Medium severity error occurred', logData)
        break
      case ErrorSeverity.LOW:
        this.logger.info('Low severity error occurred', logData)
        break
    }
  }

  private handleCriticalError(error: RouterError): void {
    this.logger.error('Critical error detected, considering shutdown', {
      errorType: error.type,
      context: error.context,
      errorCounts: Object.fromEntries(this.errorCounts)
    })

    // In a production system, you might want to trigger alerts or graceful shutdown
    // For now, we'll just log extensively
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getErrorStats(): Record<string, { count: number; lastOccurrence: Date | null }> {
    const stats: Record<string, { count: number; lastOccurrence: Date | null }> = {}
    
    for (const [type, count] of this.errorCounts) {
      stats[type] = {
        count,
        lastOccurrence: this.lastErrorTime.get(type) || null
      }
    }
    
    return stats
  }

  resetErrorStats(): void {
    this.errorCounts.clear()
    this.lastErrorTime.clear()
  }
}

export function createErrorHandler(
  logger: StructuredLogger,
  metrics?: MetricsCollector,
  retryConfig?: Partial<RetryConfig>
): ErrorHandler {
  return new ErrorHandler(logger, metrics, retryConfig)
}