import { readdirSync } from 'fs'
import { join, resolve } from 'path'
import { Container, Disposable } from '../container'
import { MetricsCollector } from '../metrics'
import { BasePlugin, PluginAPI, PluginConfig, PluginFactory, PluginMetadata } from './pluginAPI'
import { ErrorHandler, createErrorHandler } from '../core/errorHandler'
import { StructuredLogger } from '../logger'

export interface PluginLifecycle {
  onInitialize?(): Promise<void> | void
  onStart?(): Promise<void> | void
  onStop?(): Promise<void> | void
  onError?(error: Error): Promise<void> | void
}

export interface Plugin extends PluginLifecycle, Disposable {
  name: string
  version?: string
  description?: string
  initialize(container: Container): void
}

export interface PluginMetadata {
  name: string
  version: string
  description?: string
  dependencies?: string[]
}

export class PluginManager implements Disposable {
  private container: Container
  private pluginDir: string
  private plugins: Map<string, BasePlugin>
  private pluginFactories: Map<string, PluginFactory>
  private metrics?: MetricsCollector
  private errorHandler: ErrorHandler
  private logger: StructuredLogger
  private pluginConfigs: Map<string, PluginConfig>

  constructor(container: Container, pluginDir: string) {
    this.container = container
    this.pluginDir = pluginDir
    this.plugins = new Map()
    this.pluginFactories = new Map()
    this.pluginConfigs = new Map()
    
    this.logger = container.resolve<StructuredLogger>('logger')
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }

    this.errorHandler = createErrorHandler(this.logger, this.metrics)
  }

  async loadPlugins(): Promise<void> {
    try {
      const files = readdirSync(this.pluginDir)
      const pluginFiles = files.filter(file => 
        file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.mjs')
      )

      this.logger.info('Loading plugins', { 
        pluginDir: this.pluginDir, 
        fileCount: pluginFiles.length 
      })

      for (const file of pluginFiles) {
        await this.loadPlugin(file)
      }

      await this.initializePlugins()
    } catch (error) {
      this.logger.warn('Plugin directory not found or empty', { 
        pluginDir: this.pluginDir,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      this.metrics?.incrementError('load_failed', 'plugin_manager')
    }
  }

  private async loadPlugin(file: string): Promise<void> {
    try {
      const pluginPath = resolve(join(this.pluginDir, file))
      const pluginModule = await import(pluginPath)
      
      // Check for new plugin format (factory-based)
      if (pluginModule.default && pluginModule.default.create && pluginModule.default.getMetadata) {
        const factory: PluginFactory = pluginModule.default
        const metadata = factory.getMetadata()
        
        if (this.pluginFactories.has(metadata.name)) {
          throw new Error(`Plugin factory with name '${metadata.name}' already loaded`)
        }

        this.pluginFactories.set(metadata.name, factory)
        this.logger.info('Plugin factory loaded', { 
          name: metadata.name, 
          version: metadata.version,
          description: metadata.description
        })
        
        // Create default config
        const config: PluginConfig = {
          name: metadata.name,
          version: metadata.version,
          enabled: true,
          settings: this.getDefaultSettings(metadata.configSchema)
        }
        
        this.pluginConfigs.set(metadata.name, config)
        this.metrics?.incrementPluginExecution(metadata.name, 'loaded')
      }
      // Check for legacy plugin format
      else if (pluginModule.default && typeof pluginModule.default.initialize === 'function') {
        const plugin: Plugin = pluginModule.default
        
        if (this.plugins.has(plugin.name)) {
          throw new Error(`Plugin with name '${plugin.name}' already loaded`)
        }

        this.plugins.set(plugin.name, plugin)
        this.metrics?.incrementPluginExecution(plugin.name, 'loaded')
        this.logger.info('Legacy plugin loaded', { name: plugin.name })
      }
    } catch (error) {
      this.logger.error('Failed to load plugin', {
        file,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      this.metrics?.incrementError('load_failed', 'plugin_manager')
    }
  }

  private getDefaultSettings(configSchema?: Record<string, any>): Record<string, any> {
    const settings: Record<string, any> = {}
    
    if (configSchema) {
      for (const [key, schema] of Object.entries(configSchema)) {
        if (schema.default !== undefined) {
          settings[key] = schema.default
        }
      }
    }
    
    return settings
  }

  private async initializePlugins(): Promise<void> {
    // Initialize new format plugins
    for (const [name, factory] of this.pluginFactories) {
      try {
        const config = this.pluginConfigs.get(name)!
        const plugin = factory.create(this.container, config)
        
        this.plugins.set(name, plugin)
        
        if (plugin.onInitialize) {
          await this.safeExecutePluginMethod(() => plugin.onInitialize!(), name, 'initialize')
        }
        
        this.metrics?.incrementPluginExecution(name, 'initialized')
        this.logger.info('Plugin initialized', { name, version: config.version })
      } catch (error) {
        this.logger.error('Failed to initialize plugin', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        this.metrics?.incrementError('initialization_failed', 'plugin_manager')
      }
    }

    // Initialize legacy plugins
    for (const [name, plugin] of this.plugins) {
      if (this.pluginFactories.has(name)) continue // Skip already initialized new format plugins
      
      try {
        plugin.initialize(this.container)
        
        if (plugin.onInitialize) {
          await this.safeExecutePluginMethod(() => plugin.onInitialize!(), name, 'initialize')
        }
        
        this.metrics?.incrementPluginExecution(name, 'initialized')
        this.logger.info('Legacy plugin initialized', { name })
      } catch (error) {
        this.logger.error('Failed to initialize legacy plugin', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        this.metrics?.incrementError('initialization_failed', 'plugin_manager')
        
        if (plugin.onError) {
          await this.safeExecutePluginMethod(() => plugin.onError!(error as Error), name, 'error')
        }
      }
    }
  }

  private async safeExecutePluginMethod<T>(
    method: () => Promise<T> | T,
    pluginName: string,
    operation: string
  ): Promise<T | undefined> {
    try {
      return await Promise.resolve(method())
    } catch (error) {
      this.logger.error('Plugin method execution failed', {
        plugin: pluginName,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.metrics?.incrementError('plugin_method_failed', pluginName)
      return undefined
    }
  }

  async startPlugins(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onStart) {
          await this.safeExecutePluginMethod(() => plugin.onStart!(), name, 'start')
        }
        this.metrics?.incrementPluginExecution(name, 'started')
        this.logger.info('Plugin started', { name })
      } catch (error) {
        this.logger.error('Failed to start plugin', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        this.metrics?.incrementError('start_failed', 'plugin_manager')
        
        if (plugin.onError) {
          await this.safeExecutePluginMethod(() => plugin.onError!(error as Error), name, 'error')
        }
      }
    }
  }

  async stopPlugins(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onStop) {
          await this.safeExecutePluginMethod(() => plugin.onStop!(), name, 'stop')
        }
        this.metrics?.incrementPluginExecution(name, 'stopped')
        this.logger.info('Plugin stopped', { name })
      } catch (error) {
        this.logger.error('Failed to stop plugin', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        this.metrics?.incrementError('stop_failed', 'plugin_manager')
        
        if (plugin.onError) {
          await this.safeExecutePluginMethod(() => plugin.onError!(error as Error), name, 'error')
        }
      }
    }
  }

  async dispose(): Promise<void> {
    await this.stopPlugins()
    
    for (const [name, plugin] of this.plugins) {
      try {
        if (typeof plugin.dispose === 'function') {
          await this.safeExecutePluginMethod(() => plugin.dispose!(), name, 'dispose')
        }
        this.metrics?.incrementPluginExecution(name, 'disposed')
        this.logger.info('Plugin disposed', { name })
      } catch (error) {
        this.logger.error('Failed to dispose plugin', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        this.metrics?.incrementError('dispose_failed', 'plugin_manager')
      }
    }
    
    this.plugins.clear()
    this.pluginFactories.clear()
    this.pluginConfigs.clear()
  }

  getPlugin(name: string): BasePlugin | undefined {
    return this.plugins.get(name)
  }

  getAllPlugins(): BasePlugin[] {
    return Array.from(this.plugins.values())
  }

  getPluginNames(): string[] {
    return Array.from(this.plugins.keys())
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }

  getPluginConfig(name: string): PluginConfig | undefined {
    return this.pluginConfigs.get(name)
  }

  updatePluginConfig(name: string, config: Partial<PluginConfig>): boolean {
    const existingConfig = this.pluginConfigs.get(name)
    if (!existingConfig) {
      return false
    }

    const updatedConfig = { ...existingConfig, ...config }
    this.pluginConfigs.set(name, updatedConfig)
    
    this.logger.info('Plugin config updated', { name, config: updatedConfig })
    return true
  }

  enablePlugin(name: string): boolean {
    return this.updatePluginConfig(name, { enabled: true })
  }

  disablePlugin(name: string): boolean {
    return this.updatePluginConfig(name, { enabled: false })
  }

  getPluginMetadata(name: string): PluginMetadata | undefined {
    const factory = this.pluginFactories.get(name)
    return factory ? factory.getMetadata() : undefined
  }

  getAllPluginMetadata(): PluginMetadata[] {
    return Array.from(this.pluginFactories.values()).map(factory => factory.getMetadata())
  }

  async processMessage(context: any): Promise<any> {
    let currentContext = context
    
    for (const [name, plugin] of this.plugins) {
      const config = this.pluginConfigs.get(name)
      if (!config?.enabled) continue
      
      try {
        if (plugin.process) {
          const result = await this.safeExecutePluginMethod(
            () => plugin.process!(currentContext),
            name,
            'process'
          )
          
          if (result === null) {
            // Plugin blocked the message
            this.logger.debug('Message blocked by plugin', { plugin: name })
            return null
          }
          
          currentContext = result
        }
      } catch (error) {
        this.logger.error('Plugin processing error', {
          plugin: name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Continue processing with other plugins
      }
    }
    
    return currentContext
  }
}
