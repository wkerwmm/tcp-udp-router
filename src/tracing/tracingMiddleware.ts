import { CorrelationManager } from './correlationManager'
import { StructuredLogger, LogContext } from '../logger'

export interface TracingContext {
  sessionId: string
  protocol: 'tcp' | 'udp'
  remoteAddress: string
  remotePort: number
  data: Buffer
  socket?: any
  rinfo?: any
  server?: any
  metadata?: Record<string, any>
}

export interface TracingMiddleware {
  name: string
  process(context: TracingContext): Promise<TracingContext | null>
}

export class CorrelationTracingMiddleware implements TracingMiddleware {
  public readonly name = 'correlation_tracing'
  private correlationManager: CorrelationManager
  private logger: StructuredLogger

  constructor(correlationManager: CorrelationManager, logger: StructuredLogger) {
    this.correlationManager = correlationManager
    this.logger = logger
  }

  async process(context: TracingContext): Promise<TracingContext | null> {
    const correlationId = this.correlationManager.generateCorrelationId()
    const requestId = this.correlationManager.generateRequestId()
    
    return this.correlationManager.runWithCorrelation(
      correlationId,
      {
        sessionId: context.sessionId,
        component: 'tcp-udp-router',
        operation: 'process_message',
        metadata: {
          protocol: context.protocol,
          remoteAddress: context.remoteAddress,
          remotePort: context.remotePort,
          dataSize: context.data.length,
          ...context.metadata
        }
      },
      () => {
        this.logger.info('Message processing started', {
          sessionId: context.sessionId,
          protocol: context.protocol,
          remoteAddress: context.remoteAddress,
          remotePort: context.remotePort,
          dataSize: context.data.length
        })

        return context
      }
    )
  }
}

export class PerformanceTracingMiddleware implements TracingMiddleware {
  public readonly name = 'performance_tracing'
  private correlationManager: CorrelationManager
  private logger: StructuredLogger
  private performanceMetrics: Map<string, { count: number; totalDuration: number; minDuration: number; maxDuration: number }>

  constructor(correlationManager: CorrelationManager, logger: StructuredLogger) {
    this.correlationManager = correlationManager
    this.logger = logger
    this.performanceMetrics = new Map()
  }

  async process(context: TracingContext): Promise<TracingContext | null> {
    const startTime = Date.now()
    const operation = `process_${context.protocol}_message`
    
    return this.correlationManager.traceAsync(
      operation,
      {
        sessionId: context.sessionId,
        component: 'performance_tracing',
        metadata: {
          protocol: context.protocol,
          remoteAddress: context.remoteAddress,
          dataSize: context.data.length
        }
      },
      async () => {
        // Simulate processing time measurement
        const duration = Date.now() - startTime
        
        // Update performance metrics
        this.updatePerformanceMetrics(operation, duration)
        
        this.logger.debug('Message processing performance', {
          sessionId: context.sessionId,
          protocol: context.protocol,
          duration,
          dataSize: context.data.length
        })

        return context
      }
    )
  }

  private updatePerformanceMetrics(operation: string, duration: number): void {
    const existing = this.performanceMetrics.get(operation) || {
      count: 0,
      totalDuration: 0,
      minDuration: Infinity,
      maxDuration: 0
    }

    existing.count++
    existing.totalDuration += duration
    existing.minDuration = Math.min(existing.minDuration, duration)
    existing.maxDuration = Math.max(existing.maxDuration, duration)

    this.performanceMetrics.set(operation, existing)
  }

  getPerformanceMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {}
    
    for (const [operation, data] of this.performanceMetrics) {
      metrics[operation] = {
        count: data.count,
        averageDuration: data.totalDuration / data.count,
        minDuration: data.minDuration === Infinity ? 0 : data.minDuration,
        maxDuration: data.maxDuration
      }
    }
    
    return metrics
  }

  resetPerformanceMetrics(): void {
    this.performanceMetrics.clear()
  }
}

export class RequestTracingMiddleware implements TracingMiddleware {
  public readonly name = 'request_tracing'
  private correlationManager: CorrelationManager
  private logger: StructuredLogger
  private requestCounts: Map<string, number>

  constructor(correlationManager: CorrelationManager, logger: StructuredLogger) {
    this.correlationManager = correlationManager
    this.logger = logger
    this.requestCounts = new Map()
  }

  async process(context: TracingContext): Promise<TracingContext | null> {
    const requestKey = `${context.remoteAddress}:${context.protocol}`
    const count = (this.requestCounts.get(requestKey) || 0) + 1
    this.requestCounts.set(requestKey, count)

    return this.correlationManager.runWithCorrelation(
      this.correlationManager.getCorrelationId() || this.correlationManager.generateCorrelationId(),
      {
        sessionId: context.sessionId,
        component: 'request_tracing',
        operation: 'track_request',
        metadata: {
          protocol: context.protocol,
          remoteAddress: context.remoteAddress,
          requestCount: count,
          dataSize: context.data.length
        }
      },
      () => {
        this.logger.debug('Request tracked', {
          sessionId: context.sessionId,
          protocol: context.protocol,
          remoteAddress: context.remoteAddress,
          requestCount: count
        })

        return context
      }
    )
  }

  getRequestCounts(): Record<string, number> {
    return Object.fromEntries(this.requestCounts)
  }

  resetRequestCounts(): void {
    this.requestCounts.clear()
  }
}

export class TracingPipeline {
  private middlewares: TracingMiddleware[]
  private correlationManager: CorrelationManager
  private logger: StructuredLogger

  constructor(correlationManager: CorrelationManager, logger: StructuredLogger) {
    this.middlewares = []
    this.correlationManager = correlationManager
    this.logger = logger
  }

  addMiddleware(middleware: TracingMiddleware): void {
    this.middlewares.push(middleware)
    this.logger.debug('Tracing middleware added', { name: middleware.name })
  }

  removeMiddleware(name: string): boolean {
    const index = this.middlewares.findIndex(m => m.name === name)
    if (index !== -1) {
      this.middlewares.splice(index, 1)
      this.logger.debug('Tracing middleware removed', { name })
      return true
    }
    return false
  }

  async process(context: TracingContext): Promise<TracingContext | null> {
    let currentContext = context

    for (const middleware of this.middlewares) {
      try {
        const result = await middleware.process(currentContext)
        if (result === null) {
          this.logger.debug('Tracing middleware blocked context', {
            middleware: middleware.name,
            sessionId: context.sessionId
          })
          return null
        }
        currentContext = result
      } catch (error) {
        this.logger.error('Tracing middleware error', {
          middleware: middleware.name,
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Continue with other middlewares
      }
    }

    return currentContext
  }

  getMiddlewares(): string[] {
    return this.middlewares.map(m => m.name)
  }
}

export function createTracingPipeline(
  correlationManager: CorrelationManager,
  logger: StructuredLogger
): TracingPipeline {
  const pipeline = new TracingPipeline(correlationManager, logger)
  
  // Add default middlewares
  pipeline.addMiddleware(new CorrelationTracingMiddleware(correlationManager, logger))
  pipeline.addMiddleware(new PerformanceTracingMiddleware(correlationManager, logger))
  pipeline.addMiddleware(new RequestTracingMiddleware(correlationManager, logger))
  
  return pipeline
}