require('dotenv/config')
import { createContainer } from './container'
import { createLogger, StructuredLogger } from './logger'
import { loadConfig, createConfigManager } from './config'
import { TCPServer } from './net/tcpServer'
import { UDPServer } from './net/udpServer'
import { createDefaultRouter } from './core/router'
import { SessionStore } from './core/sessionStore'
import { PluginManager } from './plugins/pluginManager'
import { createPipeline } from './pipeline'
import { startHttpServer } from './httpHealth'
import { setupMetrics, MetricsCollector } from './metrics'
import { setupMonitoring } from './monitoring'

async function main() {
  try {
    const config = loadConfig()
    const configManager = createConfigManager(config)
    const container = createContainer()

    const logger = createLogger(config.LOG_LEVEL)
    container.registerSingleton('logger', logger)
    container.registerSingleton('config', config)
    container.registerSingleton('configManager', configManager)

    logger.info('Starting TCP/UDP Router', { version: '1.0.0' })

    const sessionStore = new SessionStore(container)
    container.registerSingleton('sessionStore', sessionStore)

    const router = createDefaultRouter(container)
    container.registerSingleton('router', router)

    const pipeline = createPipeline()
    container.registerSingleton('pipeline', pipeline)

    const pluginManager = new PluginManager(container, config.PLUGIN_DIR)
    await pluginManager.loadPlugins()
    container.registerSingleton('pluginManager', pluginManager)

    const metrics = setupMetrics(container, { METRICS_ENABLED: config.METRICS_ENABLED, METRICS_PORT: config.METRICS_PORT })
    if (config.METRICS_ENABLED) {
      logger.info('Metrics enabled', { port: config.METRICS_PORT })
    }

    if (config.ENABLE_HTTP_HEALTH) {
      startHttpServer(config.HTTP_HEALTH_PORT, logger)
      logger.info('HTTP health server enabled', { port: config.HTTP_HEALTH_PORT })
    }

    const monitoring = setupMonitoring(container)

    const tcpServer = new TCPServer(parseInt(config.TCP_PORT, 10), container)
    container.registerSingleton('tcpServer', tcpServer)

    const udpServer = new UDPServer(parseInt(config.UDP_PORT, 10), container)
    container.registerSingleton('udpServer', udpServer)

    tcpServer.start()
    udpServer.start()

    logger.info('TCP/UDP Router started successfully', {
      tcpPort: config.TCP_PORT,
      udpPort: config.UDP_PORT,
      metricsEnabled: config.METRICS_ENABLED,
      httpHealthEnabled: config.ENABLE_HTTP_HEALTH
    })

    process.on('SIGINT', async () => {
      logger.info('Shutting down gracefully...')
      await gracefulShutdown(container)
    })

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...')
      await gracefulShutdown(container)
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Fatal error during startup:', errorMessage)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

async function gracefulShutdown(container: any) {
  const logger: StructuredLogger = container.resolve('logger')
  
  try {
    logger.info('Starting graceful shutdown...')
    
    const tcpServer = container.resolve('tcpServer')
    const udpServer = container.resolve('udpServer')
    const sessionStore = container.resolve('sessionStore')
    
    if (tcpServer) {
      tcpServer.stop()
      logger.info('TCP server stopped')
    }
    
    if (udpServer) {
      udpServer.stop()
      logger.info('UDP server stopped')
    }
    
    if (sessionStore) {
      await sessionStore.dispose()
    }
    
    await container.dispose()
    
    logger.info('Shutdown completed successfully')
    process.exit(0)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Error during shutdown:', { error: errorMessage })
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Unhandled error in main:', err)
  process.exit(1)
})
