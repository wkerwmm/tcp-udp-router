import { Container } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'
import { ErrorHandler } from '../core/errorHandler'

export interface PluginContext {
  sessionId: string
  protocol: 'tcp' | 'udp'
  data: Buffer
  remoteAddress: string
  remotePort: number
  socket?: any
  rinfo?: any
  server?: any
  metadata?: Record<string, any>
}

export interface PluginConfig {
  name: string
  version: string
  enabled: boolean
  settings: Record<string, any>
}

export interface PluginAPI {
  // Core services
  logger: StructuredLogger
  metrics?: MetricsCollector
  errorHandler: ErrorHandler
  container: Container
  
  // Configuration
  config: PluginConfig
  
  // Plugin lifecycle
  onInitialize?(): Promise<void> | void
  onStart?(): Promise<void> | void
  onStop?(): Promise<void> | void
  onError?(error: Error): Promise<void> | void
  
  // Data processing
  process?(context: PluginContext): Promise<PluginContext | null>
  preProcess?(context: PluginContext): Promise<PluginContext | null>
  postProcess?(context: PluginContext): Promise<PluginContext | null>
  
  // Event handlers
  onConnection?(context: PluginContext): Promise<void> | void
  onDisconnection?(context: PluginContext): Promise<void> | void
  onMessage?(context: PluginContext): Promise<PluginContext | null>
  
  // Utility methods
  getSetting<T>(key: string, defaultValue?: T): T
  setSetting(key: string, value: any): void
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void
  recordMetric(name: string, value: number, labels?: Record<string, string>): void
  incrementCounter(name: string, labels?: Record<string, string>): void
}

export interface PluginMetadata {
  name: string
  version: string
  description?: string
  author?: string
  license?: string
  dependencies?: string[]
  requiredServices?: string[]
  configSchema?: Record<string, any>
}

export abstract class BasePlugin implements PluginAPI {
  public readonly logger: StructuredLogger
  public readonly metrics?: MetricsCollector
  public readonly errorHandler: ErrorHandler
  public readonly container: Container
  public readonly config: PluginConfig
  
  protected settings: Map<string, any> = new Map()

  constructor(
    container: Container,
    config: PluginConfig,
    logger: StructuredLogger,
    metrics?: MetricsCollector,
    errorHandler?: ErrorHandler
  ) {
    this.container = container
    this.config = config
    this.logger = logger
    this.metrics = metrics
    this.errorHandler = errorHandler || new ErrorHandler(logger, metrics)
    
    // Initialize settings from config
    if (config.settings) {
      for (const [key, value] of Object.entries(config.settings)) {
        this.settings.set(key, value)
      }
    }
  }

  // Default implementations
  onInitialize?(): Promise<void> | void
  onStart?(): Promise<void> | void
  onStop?(): Promise<void> | void
  onError?(error: Error): Promise<void> | void
  process?(context: PluginContext): Promise<PluginContext | null>
  preProcess?(context: PluginContext): Promise<PluginContext | null>
  postProcess?(context: PluginContext): Promise<PluginContext | null>
  onConnection?(context: PluginContext): Promise<void> | void
  onDisconnection?(context: PluginContext): Promise<void> | void
  onMessage?(context: PluginContext): Promise<PluginContext | null>

  getSetting<T>(key: string, defaultValue?: T): T {
    return this.settings.get(key) ?? defaultValue
  }

  setSetting(key: string, value: any): void {
    this.settings.set(key, value)
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    const logData = {
      plugin: this.config.name,
      ...data
    }
    
    this.logger[level](message, logData)
  }

  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    if (this.metrics) {
      // This would need to be implemented in the metrics collector
      this.logger.debug('Metric recorded', { name, value, labels })
    }
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    if (this.metrics) {
      // This would need to be implemented in the metrics collector
      this.logger.debug('Counter incremented', { name, labels })
    }
  }

  // Helper method for safe async operations
  protected async safeExecute<T>(
    operation: () => Promise<T>,
    context: string,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await operation()
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        component: this.config.name,
        operation: context
      })
      return fallback
    }
  }

  // Helper method for data validation
  protected validateData(data: Buffer, expectedFormat?: string): boolean {
    if (!data || data.length === 0) {
      this.logger.warn('Empty data received', { plugin: this.config.name })
      return false
    }

    // Add format-specific validation here
    if (expectedFormat === 'json') {
      try {
        JSON.parse(data.toString())
        return true
      } catch {
        this.logger.warn('Invalid JSON data', { plugin: this.config.name })
        return false
      }
    }

    return true
  }

  // Helper method for creating responses
  protected createResponse(data: string | Buffer, context: PluginContext): PluginContext {
    return {
      ...context,
      data: Buffer.isBuffer(data) ? data : Buffer.from(data)
    }
  }
}

export interface PluginFactory {
  create(container: Container, config: PluginConfig): BasePlugin
  getMetadata(): PluginMetadata
}

export function createPluginFactory(
  pluginClass: new (container: Container, config: PluginConfig, logger: StructuredLogger, metrics?: MetricsCollector, errorHandler?: ErrorHandler) => BasePlugin,
  metadata: PluginMetadata
): PluginFactory {
  return {
    create(container: Container, config: PluginConfig): BasePlugin {
      const logger = container.resolve<StructuredLogger>('logger')
      const metrics = container.has('metrics') ? container.resolve<MetricsCollector>('metrics') : undefined
      const errorHandler = container.has('errorHandler') ? container.resolve<ErrorHandler>('errorHandler') : undefined
      
      return new pluginClass(container, config, logger, metrics, errorHandler)
    },
    getMetadata(): PluginMetadata {
      return metadata
    }
  }
}