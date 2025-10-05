import winston from 'winston'
import { Container } from './container'
import { randomUUID } from 'crypto'

export interface LogContext {
  correlationId?: string
  sessionId?: string
  requestId?: string
  userId?: string
  component?: string
  operation?: string
  duration?: number
  [key: string]: any
}

export interface StructuredLogger {
  info(message: string, meta?: LogContext): void
  warn(message: string, meta?: LogContext): void
  error(message: string, meta?: LogContext): void
  debug(message: string, meta?: LogContext): void
  child(meta: LogContext): StructuredLogger
  withCorrelationId(correlationId: string): StructuredLogger
  withSessionId(sessionId: string): StructuredLogger
  withRequestId(requestId: string): StructuredLogger
  withComponent(component: string): StructuredLogger
  withOperation(operation: string): StructuredLogger
  trace(operation: string, meta?: LogContext): TraceLogger
}

export interface TraceLogger {
  end(meta?: LogContext): void
  error(error: Error, meta?: LogContext): void
  success(meta?: LogContext): void
}

class TraceLoggerImpl implements TraceLogger {
  private logger: winston.Logger
  private operation: string
  private startTime: number
  private context: LogContext

  constructor(logger: winston.Logger, operation: string, context: LogContext = {}) {
    this.logger = logger
    this.operation = operation
    this.startTime = Date.now()
    this.context = context
  }

  end(meta?: LogContext): void {
    const duration = Date.now() - this.startTime
    const finalContext = {
      ...this.context,
      ...meta,
      operation: this.operation,
      duration
    }
    
    this.logger.info(`Operation completed: ${this.operation}`, finalContext)
  }

  error(error: Error, meta?: LogContext): void {
    const duration = Date.now() - this.startTime
    const finalContext = {
      ...this.context,
      ...meta,
      operation: this.operation,
      duration,
      error: error.message,
      stack: error.stack
    }
    
    this.logger.error(`Operation failed: ${this.operation}`, finalContext)
  }

  success(meta?: LogContext): void {
    const duration = Date.now() - this.startTime
    const finalContext = {
      ...this.context,
      ...meta,
      operation: this.operation,
      duration,
      status: 'success'
    }
    
    this.logger.info(`Operation succeeded: ${this.operation}`, finalContext)
  }
}

class WinstonStructuredLogger implements StructuredLogger {
  private logger: winston.Logger
  private context: LogContext

  constructor(logger: winston.Logger, context: LogContext = {}) {
    this.logger = logger
    this.context = context
  }

  info(message: string, meta?: LogContext): void {
    this.logger.info(message, { ...this.context, ...meta })
  }

  warn(message: string, meta?: LogContext): void {
    this.logger.warn(message, { ...this.context, ...meta })
  }

  error(message: string, meta?: LogContext): void {
    this.logger.error(message, { ...this.context, ...meta })
  }

  debug(message: string, meta?: LogContext): void {
    this.logger.debug(message, { ...this.context, ...meta })
  }

  child(meta: LogContext): StructuredLogger {
    const childLogger = this.logger.child({ ...this.context, ...meta })
    return new WinstonStructuredLogger(childLogger, { ...this.context, ...meta })
  }

  withCorrelationId(correlationId: string): StructuredLogger {
    return new WinstonStructuredLogger(this.logger, { ...this.context, correlationId })
  }

  withSessionId(sessionId: string): StructuredLogger {
    return new WinstonStructuredLogger(this.logger, { ...this.context, sessionId })
  }

  withRequestId(requestId: string): StructuredLogger {
    return new WinstonStructuredLogger(this.logger, { ...this.context, requestId })
  }

  withComponent(component: string): StructuredLogger {
    return new WinstonStructuredLogger(this.logger, { ...this.context, component })
  }

  withOperation(operation: string): StructuredLogger {
    return new WinstonStructuredLogger(this.logger, { ...this.context, operation })
  }

  trace(operation: string, meta?: LogContext): TraceLogger {
    return new TraceLoggerImpl(this.logger, operation, { ...this.context, ...meta })
  }
}

export function createLogger(level: string = 'info'): StructuredLogger {
  const logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf((info) => {
        const { timestamp, level, message, service, correlationId, sessionId, requestId, component, operation, duration, ...meta } = info
        
        return JSON.stringify({
          timestamp,
          level,
          message,
          service,
          correlationId,
          sessionId,
          requestId,
          component,
          operation,
          duration,
          meta: Object.keys(meta).length > 0 ? meta : undefined
        })
      })
    ),
    defaultMeta: { 
      service: 'tcp-udp-router',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }),
      new winston.transports.File({ 
        filename: 'logs/combined.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }),
      new winston.transports.File({ 
        filename: 'logs/access.log',
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    ]
  })

  return new WinstonStructuredLogger(logger)
}

export function registerLogger(container: Container, level: string = 'info'): StructuredLogger {
  const logger = createLogger(level)
  container.registerSingleton('logger', logger)
  return logger
}
