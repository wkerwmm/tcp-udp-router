import { readdirSync } from 'fs'
import { join } from 'path'
import { Container, Disposable } from '../container'
import { MetricsCollector } from '../metrics'

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
  private plugins: Map<string, Plugin>
  private metrics?: MetricsCollector

  constructor(container: Container, pluginDir: string) {
    this.container = container
    this.pluginDir = pluginDir
    this.plugins = new Map()
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }
  }

  async loadPlugins(): Promise<void> {
    try {
      const files = readdirSync(this.pluginDir)
      const pluginFiles = files.filter(file => 
        file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.mjs')
      )

      for (const file of pluginFiles) {
        await this.loadPlugin(file)
      }

      await this.initializePlugins()
    } catch (error) {
      console.warn('Plugin directory not found or empty:', error)
      this.metrics?.incrementError('load_failed', 'plugin_manager')
    }
  }

  private async loadPlugin(file: string): Promise<void> {
    try {
      const pluginPath = join(this.pluginDir, file)
      const pluginModule = await import(pluginPath)
      
      if (pluginModule.default && typeof pluginModule.default.initialize === 'function') {
        const plugin: Plugin = pluginModule.default
        
        if (this.plugins.has(plugin.name)) {
          throw new Error(`Plugin with name '${plugin.name}' already loaded`)
        }

        this.plugins.set(plugin.name, plugin)
        this.metrics?.incrementPluginExecution(plugin.name, 'loaded')
        console.log(`Plugin loaded: ${plugin.name}`)
      }
    } catch (error) {
      console.error(`Failed to load plugin ${file}:`, error)
      this.metrics?.incrementError('load_failed', 'plugin_manager')
    }
  }

  private async initializePlugins(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        plugin.initialize(this.container)
        
        if (plugin.onInitialize) {
          await Promise.resolve(plugin.onInitialize())
        }
        
        this.metrics?.incrementPluginExecution(name, 'initialized')
        console.log(`Plugin initialized: ${name}`)
      } catch (error) {
        console.error(`Failed to initialize plugin ${name}:`, error)
        this.metrics?.incrementError('initialization_failed', 'plugin_manager')
        
        if (plugin.onError) {
          await Promise.resolve(plugin.onError(error as Error))
        }
      }
    }
  }

  async startPlugins(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onStart) {
          await Promise.resolve(plugin.onStart())
        }
        this.metrics?.incrementPluginExecution(name, 'started')
        console.log(`Plugin started: ${name}`)
      } catch (error) {
        console.error(`Failed to start plugin ${name}:`, error)
        this.metrics?.incrementError('start_failed', 'plugin_manager')
        
        if (plugin.onError) {
          await Promise.resolve(plugin.onError(error as Error))
        }
      }
    }
  }

  async stopPlugins(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onStop) {
          await Promise.resolve(plugin.onStop())
        }
        this.metrics?.incrementPluginExecution(name, 'stopped')
        console.log(`Plugin stopped: ${name}`)
      } catch (error) {
        console.error(`Failed to stop plugin ${name}:`, error)
        this.metrics?.incrementError('stop_failed', 'plugin_manager')
        
        if (plugin.onError) {
          await Promise.resolve(plugin.onError(error as Error))
        }
      }
    }
  }

  async dispose(): Promise<void> {
    await this.stopPlugins()
    
    for (const [name, plugin] of this.plugins) {
      try {
        if (typeof plugin.dispose === 'function') {
          await Promise.resolve(plugin.dispose())
        }
        this.metrics?.incrementPluginExecution(name, 'disposed')
        console.log(`Plugin disposed: ${name}`)
      } catch (error) {
        console.error(`Failed to dispose plugin ${name}:`, error)
        this.metrics?.incrementError('dispose_failed', 'plugin_manager')
      }
    }
    
    this.plugins.clear()
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name)
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  getPluginNames(): string[] {
    return Array.from(this.plugins.keys())
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }
}
