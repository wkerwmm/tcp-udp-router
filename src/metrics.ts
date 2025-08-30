import express from 'express'
import client from 'prom-client'
import { Container } from './container'

const collectDefaultMetrics = client.collectDefaultMetrics
collectDefaultMetrics()

const tcpConnections = new client.Gauge({
  name: 'tcp_connections_total',
  help: 'Total number of active TCP connections',
  labelNames: ['status']
})

const udpConnections = new client.Gauge({
  name: 'udp_connections_total',
  help: 'Total number of active UDP connections',
  labelNames: ['status']
})

const messagesProcessed = new client.Counter({
  name: 'messages_processed_total',
  help: 'Total number of messages processed',
  labelNames: ['protocol', 'status']
})

const messageSizeBytes = new client.Histogram({
  name: 'message_size_bytes',
  help: 'Size of processed messages in bytes',
  labelNames: ['protocol'],
  buckets: [64, 256, 1024, 4096, 16384, 65536]
})

const processingTimeSeconds = new client.Histogram({
  name: 'processing_time_seconds',
  help: 'Time taken to process messages',
  labelNames: ['protocol'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
})

const pipelineStages = new client.Counter({
  name: 'pipeline_stages_executed_total',
  help: 'Total number of pipeline stages executed',
  labelNames: ['stage', 'status']
})

const pluginExecutions = new client.Counter({
  name: 'plugin_executions_total',
  help: 'Total number of plugin executions',
  labelNames: ['plugin', 'status']
})

const routerMatches = new client.Counter({
  name: 'router_matches_total',
  help: 'Total number of router matches',
  labelNames: ['route']
})

const errorCounter = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors occurred',
  labelNames: ['type', 'component']
})

export interface MetricsCollector {
  incrementTcpConnections(status?: string): void
  decrementTcpConnections(status?: string): void
  incrementUdpConnections(status?: string): void
  decrementUdpConnections(status?: string): void
  incrementMessagesProcessed(protocol: string, status?: string): void
  recordMessageSize(protocol: string, size: number): void
  recordProcessingTime(protocol: string, duration: number): void
  incrementPipelineStage(stage: string, status?: string): void
  incrementPluginExecution(plugin: string, status?: string): void
  incrementRouterMatch(route: string): void
  incrementError(type: string, component: string): void
}

class DefaultMetricsCollector implements MetricsCollector {
  incrementTcpConnections(status: string = 'active'): void {
    tcpConnections.inc({ status })
  }

  decrementTcpConnections(status: string = 'active'): void {
    tcpConnections.dec({ status })
  }

  incrementUdpConnections(status: string = 'active'): void {
    udpConnections.inc({ status })
  }

  decrementUdpConnections(status: string = 'active'): void {
    udpConnections.dec({ status })
  }

  incrementMessagesProcessed(protocol: string, status: string = 'success'): void {
    messagesProcessed.inc({ protocol, status })
  }

  recordMessageSize(protocol: string, size: number): void {
    messageSizeBytes.observe({ protocol }, size)
  }

  recordProcessingTime(protocol: string, duration: number): void {
    processingTimeSeconds.observe({ protocol }, duration)
  }

  incrementPipelineStage(stage: string, status: string = 'success'): void {
    pipelineStages.inc({ stage, status })
  }

  incrementPluginExecution(plugin: string, status: string = 'success'): void {
    pluginExecutions.inc({ plugin, status })
  }

  incrementRouterMatch(route: string): void {
    routerMatches.inc({ route })
  }

  incrementError(type: string, component: string): void {
    errorCounter.inc({ type, component })
  }
}

export function setupMetrics(container?: Container, config?: { METRICS_ENABLED?: boolean; METRICS_PORT?: string }): MetricsCollector {
  const collector = new DefaultMetricsCollector()

  if (container) {
    container.registerSingleton('metrics', collector)
  }

  const metricsEnabled = config?.METRICS_ENABLED ?? true
  if (metricsEnabled) {
    const app = express()

    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', client.register.contentType)
        res.end(await client.register.metrics())
      } catch (err) {
        res.status(500).end(err)
      }
    })

    const metricsPort = config?.METRICS_PORT || process.env.METRICS_PORT || '3001'
    app.listen(metricsPort, () => {
      console.log(`Metrics server listening on port ${metricsPort}`)
    })
  }

  return collector
}

export function createMetricsCollector(): MetricsCollector {
  return new DefaultMetricsCollector()
}
