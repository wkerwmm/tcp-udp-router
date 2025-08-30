import winston from 'winston'
import { Container } from './container'

export interface StructuredLogger {
  info(message: string, meta?: Record<string, any>): void
  warn(message: string, meta?: Record<string, any>): void
  error(message: string, meta?: Record<string, any>): void
  debug(message: string, meta?: Record<string, any>): void
  child(meta: Record<string, any>): StructuredLogger
}

class WinstonStructuredLogger implements StructuredLogger {
  private logger: winston.Logger

  constructor(logger: winston.Logger) {
    this.logger = logger
  }

  info(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, meta)
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, meta)
  }

  error(message: string, meta?: Record<string, any>): void {
    this.logger.error(message, meta)
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, meta)
  }

  child(meta: Record<string, any>): StructuredLogger {
    const childLogger = this.logger.child(meta)
    return new WinstonStructuredLogger(childLogger)
  }
}

export function createLogger(level: string = 'info'): StructuredLogger {
  const logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'tcp-udp-router' },
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
