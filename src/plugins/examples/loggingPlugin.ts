import { BasePlugin, PluginContext, PluginConfig, PluginMetadata } from '../pluginAPI'

export interface LoggingPluginConfig extends PluginConfig {
  settings: {
    logLevel: 'debug' | 'info' | 'warn' | 'error'
    logData: boolean
    logMetadata: boolean
    maxDataLength: number
    includeTimestamps: boolean
  }
}

export class LoggingPlugin extends BasePlugin {
  private messageCount = 0
  private errorCount = 0

  async onInitialize(): Promise<void> {
    this.log('info', 'Logging plugin initialized', {
      logLevel: this.getSetting('logLevel'),
      logData: this.getSetting('logData')
    })
  }

  async onStart(): Promise<void> {
    this.log('info', 'Logging plugin started')
  }

  async onStop(): Promise<void> {
    this.log('info', 'Logging plugin stopped', {
      totalMessages: this.messageCount,
      totalErrors: this.errorCount
    })
  }

  async onError(error: Error): Promise<void> {
    this.errorCount++
    this.log('error', 'Plugin error occurred', {
      error: error.message,
      stack: error.stack
    })
  }

  async process(context: PluginContext): Promise<PluginContext | null> {
    this.messageCount++
    
    const logData: any = {
      sessionId: context.sessionId,
      protocol: context.protocol,
      remoteAddress: context.remoteAddress,
      remotePort: context.remotePort,
      messageNumber: this.messageCount
    }

    // Add data if enabled and within limits
    if (this.getSetting('logData') && context.data) {
      const maxLength = this.getSetting('maxDataLength', 1000)
      const dataStr = context.data.toString()
      logData.data = dataStr.length > maxLength 
        ? dataStr.substring(0, maxLength) + '...' 
        : dataStr
      logData.dataLength = context.data.length
    }

    // Add metadata if enabled
    if (this.getSetting('logMetadata') && context.metadata) {
      logData.metadata = context.metadata
    }

    // Add timestamp if enabled
    if (this.getSetting('includeTimestamps')) {
      logData.timestamp = new Date().toISOString()
    }

    this.log(this.getSetting('logLevel', 'info'), 'Message processed', logData)

    return context
  }

  async onConnection(context: PluginContext): Promise<void> {
    this.log('info', 'New connection', {
      sessionId: context.sessionId,
      protocol: context.protocol,
      remoteAddress: context.remoteAddress,
      remotePort: context.remotePort
    })
  }

  async onDisconnection(context: PluginContext): Promise<void> {
    this.log('info', 'Connection closed', {
      sessionId: context.sessionId,
      protocol: context.protocol,
      remoteAddress: context.remoteAddress,
      remotePort: context.remotePort
    })
  }

  async onMessage(context: PluginContext): Promise<PluginContext | null> {
    return this.process(context)
  }

  getStats(): { messageCount: number; errorCount: number } {
    return {
      messageCount: this.messageCount,
      errorCount: this.errorCount
    }
  }
}

export const loggingPluginMetadata: PluginMetadata = {
  name: 'logging',
  version: '1.0.0',
  description: 'Logs all incoming messages and connections',
  author: 'TCP/UDP Router Team',
  license: 'MIT',
  configSchema: {
    logLevel: {
      type: 'string',
      enum: ['debug', 'info', 'warn', 'error'],
      default: 'info',
      description: 'Minimum log level to output'
    },
    logData: {
      type: 'boolean',
      default: true,
      description: 'Whether to log message data'
    },
    logMetadata: {
      type: 'boolean',
      default: false,
      description: 'Whether to log message metadata'
    },
    maxDataLength: {
      type: 'number',
      default: 1000,
      description: 'Maximum length of data to log'
    },
    includeTimestamps: {
      type: 'boolean',
      default: true,
      description: 'Whether to include timestamps in logs'
    }
  }
}