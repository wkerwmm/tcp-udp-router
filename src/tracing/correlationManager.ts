import { randomUUID } from 'crypto'
import { AsyncLocalStorage } from 'async_hooks'
import { StructuredLogger, LogContext } from '../logger'

export interface CorrelationContext {
  correlationId: string
  sessionId?: string
  requestId?: string
  userId?: string
  component?: string
  operation?: string
  startTime: number
  metadata?: Record<string, any>
}

export class CorrelationManager {
  private static instance: CorrelationManager
  private asyncLocalStorage: AsyncLocalStorage<CorrelationContext>
  private logger: StructuredLogger

  private constructor(logger: StructuredLogger) {
    this.asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>()
    this.logger = logger
  }

  static getInstance(logger: StructuredLogger): CorrelationManager {
    if (!CorrelationManager.instance) {
      CorrelationManager.instance = new CorrelationManager(logger)
    }
    return CorrelationManager.instance
  }

  generateCorrelationId(): string {
    return randomUUID()
  }

  generateRequestId(): string {
    return randomUUID()
  }

  runWithCorrelation<T>(
    correlationId: string,
    context: Partial<CorrelationContext> = {},
    fn: () => T
  ): T {
    const fullContext: CorrelationContext = {
      correlationId,
      startTime: Date.now(),
      ...context
    }

    return this.asyncLocalStorage.run(fullContext, fn)
  }

  runWithNewCorrelation<T>(
    context: Partial<CorrelationContext> = {},
    fn: () => T
  ): T {
    return this.runWithCorrelation(this.generateCorrelationId(), context, fn)
  }

  getCurrentContext(): CorrelationContext | undefined {
    return this.asyncLocalStorage.getStore()
  }

  getCorrelationId(): string | undefined {
    return this.getCurrentContext()?.correlationId
  }

  getSessionId(): string | undefined {
    return this.getCurrentContext()?.sessionId
  }

  getRequestId(): string | undefined {
    return this.getCurrentContext()?.requestId
  }

  getUserId(): string | undefined {
    return this.getCurrentContext()?.userId
  }

  getComponent(): string | undefined {
    return this.getCurrentContext()?.component
  }

  getOperation(): string | undefined {
    return this.getCurrentContext()?.operation
  }

  getDuration(): number | undefined {
    const context = this.getCurrentContext()
    return context ? Date.now() - context.startTime : undefined
  }

  setMetadata(key: string, value: any): void {
    const context = this.getCurrentContext()
    if (context) {
      if (!context.metadata) {
        context.metadata = {}
      }
      context.metadata[key] = value
    }
  }

  getMetadata(key: string): any {
    const context = this.getCurrentContext()
    return context?.metadata?.[key]
  }

  getAllMetadata(): Record<string, any> {
    const context = this.getCurrentContext()
    return context?.metadata || {}
  }

  createLogContext(additionalContext: LogContext = {}): LogContext {
    const currentContext = this.getCurrentContext()
    if (!currentContext) {
      return additionalContext
    }

    return {
      correlationId: currentContext.correlationId,
      sessionId: currentContext.sessionId,
      requestId: currentContext.requestId,
      userId: currentContext.userId,
      component: currentContext.component,
      operation: currentContext.operation,
      duration: this.getDuration(),
      ...currentContext.metadata,
      ...additionalContext
    }
  }

  createChildLogger(): StructuredLogger {
    const context = this.createLogContext()
    return this.logger.child(context)
  }

  trace<T>(
    operation: string,
    context: Partial<CorrelationContext> = {},
    fn: () => T
  ): T {
    const currentContext = this.getCurrentContext()
    const traceContext = {
      ...currentContext,
      ...context,
      operation
    }

    return this.runWithCorrelation(
      traceContext.correlationId || this.generateCorrelationId(),
      traceContext,
      () => {
        const traceLogger = this.logger.trace(operation, this.createLogContext())
        
        try {
          const result = fn()
          
          // Handle promises
          if (result && typeof result === 'object' && 'then' in result) {
            return (result as Promise<T>).then(
              (value) => {
                traceLogger.success()
                return value
              },
              (error) => {
                traceLogger.error(error)
                throw error
              }
            )
          }
          
          traceLogger.success()
          return result
        } catch (error) {
          traceLogger.error(error as Error)
          throw error
        }
      }
    )
  }

  async traceAsync<T>(
    operation: string,
    context: Partial<CorrelationContext> = {},
    fn: () => Promise<T>
  ): Promise<T> {
    const currentContext = this.getCurrentContext()
    const traceContext = {
      ...currentContext,
      ...context,
      operation
    }

    return this.runWithCorrelation(
      traceContext.correlationId || this.generateCorrelationId(),
      traceContext,
      async () => {
        const traceLogger = this.logger.trace(operation, this.createLogContext())
        
        try {
          const result = await fn()
          traceLogger.success()
          return result
        } catch (error) {
          traceLogger.error(error as Error)
          throw error
        }
      }
    )
  }

  logWithContext(level: 'info' | 'warn' | 'error' | 'debug', message: string, additionalContext: LogContext = {}): void {
    const context = this.createLogContext(additionalContext)
    this.logger[level](message, context)
  }

  info(message: string, additionalContext: LogContext = {}): void {
    this.logWithContext('info', message, additionalContext)
  }

  warn(message: string, additionalContext: LogContext = {}): void {
    this.logWithContext('warn', message, additionalContext)
  }

  error(message: string, additionalContext: LogContext = {}): void {
    this.logWithContext('error', message, additionalContext)
  }

  debug(message: string, additionalContext: LogContext = {}): void {
    this.logWithContext('debug', message, additionalContext)
  }
}

export function createCorrelationManager(logger: StructuredLogger): CorrelationManager {
  return CorrelationManager.getInstance(logger)
}

// Helper function to get correlation manager from container
export function getCorrelationManager(container: any): CorrelationManager {
  if (container.has('correlationManager')) {
    return container.resolve('correlationManager')
  }
  
  const logger = container.resolve('logger')
  return createCorrelationManager(logger)
}