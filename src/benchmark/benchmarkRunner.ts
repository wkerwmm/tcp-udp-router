import { createSocket, Socket } from 'dgram'
import { Socket as NetSocket, connect } from 'net'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export interface BenchmarkConfig {
  name: string
  protocol: 'tcp' | 'udp'
  host: string
  port: number
  duration: number // in seconds
  concurrency: number
  messageSize: number
  messageRate?: number // messages per second per connection
  warmupDuration?: number // in seconds
  cooldownDuration?: number // in seconds
  timeout?: number // in milliseconds
}

export interface BenchmarkResult {
  name: string
  protocol: string
  duration: number
  concurrency: number
  totalMessages: number
  successfulMessages: number
  failedMessages: number
  throughput: number // messages per second
  latency: {
    min: number
    max: number
    average: number
    p50: number
    p90: number
    p95: number
    p99: number
  }
  errorRate: number
  resourceUsage: {
    cpu: number
    memory: number
  }
  timestamp: Date
}

export interface ConnectionStats {
  connectionId: string
  messagesSent: number
  messagesReceived: number
  errors: number
  totalLatency: number
  minLatency: number
  maxLatency: number
  startTime: number
  endTime?: number
}

export class BenchmarkRunner {
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private results: BenchmarkResult[] = []

  constructor(logger: StructuredLogger, metrics?: MetricsCollector) {
    this.logger = logger
    this.metrics = metrics
  }

  async runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
    this.logger.info('Starting benchmark', {
      name: config.name,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      duration: config.duration,
      concurrency: config.concurrency
    })

    const startTime = Date.now()
    const connections: ConnectionStats[] = []
    const latencies: number[] = []
    let totalMessages = 0
    let successfulMessages = 0
    let failedMessages = 0

    try {
      // Warmup phase
      if (config.warmupDuration && config.warmupDuration > 0) {
        this.logger.info('Starting warmup phase', { duration: config.warmupDuration })
        await this.runWarmup(config)
      }

      // Main benchmark phase
      this.logger.info('Starting main benchmark phase', { duration: config.duration })
      
      const connectionPromises = []
      for (let i = 0; i < config.concurrency; i++) {
        const connectionId = `conn_${i}`
        const connectionStats: ConnectionStats = {
          connectionId,
          messagesSent: 0,
          messagesReceived: 0,
          errors: 0,
          totalLatency: 0,
          minLatency: Infinity,
          maxLatency: 0,
          startTime: Date.now()
        }
        connections.push(connectionStats)

        const promise = this.runConnection(config, connectionStats, latencies)
        connectionPromises.push(promise)
      }

      // Wait for all connections to complete
      const connectionResults = await Promise.all(connectionPromises)
      
      // Aggregate results
      for (const result of connectionResults) {
        totalMessages += result.messagesSent
        successfulMessages += result.messagesReceived
        failedMessages += result.errors
      }

      // Cooldown phase
      if (config.cooldownDuration && config.cooldownDuration > 0) {
        this.logger.info('Starting cooldown phase', { duration: config.cooldownDuration })
        await this.sleep(config.cooldownDuration * 1000)
      }

      const endTime = Date.now()
      const actualDuration = (endTime - startTime) / 1000

      // Calculate metrics
      const throughput = successfulMessages / actualDuration
      const errorRate = failedMessages / totalMessages
      const latency = this.calculateLatencyStats(latencies)

      const result: BenchmarkResult = {
        name: config.name,
        protocol: config.protocol,
        duration: actualDuration,
        concurrency: config.concurrency,
        totalMessages,
        successfulMessages,
        failedMessages,
        throughput,
        latency,
        errorRate,
        resourceUsage: await this.getResourceUsage(),
        timestamp: new Date()
      }

      this.results.push(result)
      this.logger.info('Benchmark completed', result)

      return result
    } catch (error) {
      this.logger.error('Benchmark failed', {
        name: config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  private async runWarmup(config: BenchmarkConfig): Promise<void> {
    const warmupConfig = {
      ...config,
      duration: config.warmupDuration!,
      concurrency: Math.min(config.concurrency, 5) // Use fewer connections for warmup
    }
    
    await this.runBenchmark(warmupConfig)
  }

  private async runConnection(
    config: BenchmarkConfig,
    stats: ConnectionStats,
    latencies: number[]
  ): Promise<ConnectionStats> {
    const message = Buffer.alloc(config.messageSize, 'A')
    const endTime = Date.now() + (config.duration * 1000)
    
    if (config.protocol === 'tcp') {
      return this.runTcpConnection(config, stats, latencies, message, endTime)
    } else {
      return this.runUdpConnection(config, stats, latencies, message, endTime)
    }
  }

  private async runTcpConnection(
    config: BenchmarkConfig,
    stats: ConnectionStats,
    latencies: number[],
    message: Buffer,
    endTime: number
  ): Promise<ConnectionStats> {
    return new Promise((resolve) => {
      const socket = connect(config.port, config.host)
      let messageInterval: NodeJS.Timeout | null = null

      socket.on('connect', () => {
        this.logger.debug('TCP connection established', { connectionId: stats.connectionId })
        
        // Start sending messages
        const sendMessage = () => {
          if (Date.now() >= endTime) {
            if (messageInterval) clearInterval(messageInterval)
            socket.end()
            return
          }

          const sendTime = Date.now()
          stats.messagesSent++

          socket.write(message, (error) => {
            if (error) {
              stats.errors++
              this.logger.debug('TCP send error', {
                connectionId: stats.connectionId,
                error: error.message
              })
            }
          })
        }

        // Send messages at specified rate
        if (config.messageRate) {
          const interval = 1000 / config.messageRate
          messageInterval = setInterval(sendMessage, interval)
        } else {
          // Send as fast as possible
          const sendLoop = () => {
            sendMessage()
            if (Date.now() < endTime) {
              setImmediate(sendLoop)
            }
          }
          sendLoop()
        }
      })

      socket.on('data', (data) => {
        const receiveTime = Date.now()
        const latency = receiveTime - stats.startTime
        stats.messagesReceived++
        stats.totalLatency += latency
        stats.minLatency = Math.min(stats.minLatency, latency)
        stats.maxLatency = Math.max(stats.maxLatency, latency)
        latencies.push(latency)
      })

      socket.on('error', (error) => {
        stats.errors++
        this.logger.debug('TCP connection error', {
          connectionId: stats.connectionId,
          error: error.message
        })
      })

      socket.on('close', () => {
        stats.endTime = Date.now()
        if (messageInterval) clearInterval(messageInterval)
        this.logger.debug('TCP connection closed', {
          connectionId: stats.connectionId,
          messagesSent: stats.messagesSent,
          messagesReceived: stats.messagesReceived,
          errors: stats.errors
        })
        resolve(stats)
      })

      // Set timeout
      if (config.timeout) {
        setTimeout(() => {
          socket.destroy()
          resolve(stats)
        }, config.timeout)
      }
    })
  }

  private async runUdpConnection(
    config: BenchmarkConfig,
    stats: ConnectionStats,
    latencies: number[],
    message: Buffer,
    endTime: number
  ): Promise<ConnectionStats> {
    return new Promise((resolve) => {
      const socket = createSocket('udp4')
      let messageInterval: NodeJS.Timeout | null = null

      const sendMessage = () => {
        if (Date.now() >= endTime) {
          if (messageInterval) clearInterval(messageInterval)
          socket.close()
          return
        }

        const sendTime = Date.now()
        stats.messagesSent++

        socket.send(message, config.port, config.host, (error) => {
          if (error) {
            stats.errors++
            this.logger.debug('UDP send error', {
              connectionId: stats.connectionId,
              error: error.message
            })
          }
        })
      }

      socket.on('message', (data, rinfo) => {
        const receiveTime = Date.now()
        const latency = receiveTime - stats.startTime
        stats.messagesReceived++
        stats.totalLatency += latency
        stats.minLatency = Math.min(stats.minLatency, latency)
        stats.maxLatency = Math.max(stats.maxLatency, latency)
        latencies.push(latency)
      })

      socket.on('error', (error) => {
        stats.errors++
        this.logger.debug('UDP socket error', {
          connectionId: stats.connectionId,
          error: error.message
        })
      })

      socket.on('close', () => {
        stats.endTime = Date.now()
        if (messageInterval) clearInterval(messageInterval)
        this.logger.debug('UDP connection closed', {
          connectionId: stats.connectionId,
          messagesSent: stats.messagesSent,
          messagesReceived: stats.messagesReceived,
          errors: stats.errors
        })
        resolve(stats)
      })

      // Start sending messages
      if (config.messageRate) {
        const interval = 1000 / config.messageRate
        messageInterval = setInterval(sendMessage, interval)
      } else {
        // Send as fast as possible
        const sendLoop = () => {
          sendMessage()
          if (Date.now() < endTime) {
            setImmediate(sendLoop)
          }
        }
        sendLoop()
      }

      // Set timeout
      if (config.timeout) {
        setTimeout(() => {
          socket.close()
          resolve(stats)
        }, config.timeout)
      }
    })
  }

  private calculateLatencyStats(latencies: number[]): BenchmarkResult['latency'] {
    if (latencies.length === 0) {
      return {
        min: 0,
        max: 0,
        average: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0
      }
    }

    const sorted = latencies.sort((a, b) => a - b)
    const len = sorted.length

    return {
      min: sorted[0],
      max: sorted[len - 1],
      average: latencies.reduce((sum, lat) => sum + lat, 0) / len,
      p50: sorted[Math.floor(len * 0.5)],
      p90: sorted[Math.floor(len * 0.9)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)]
    }
  }

  private async getResourceUsage(): Promise<BenchmarkResult['resourceUsage']> {
    const usage = process.cpuUsage()
    const memory = process.memoryUsage()
    
    return {
      cpu: usage.user + usage.system,
      memory: memory.heapUsed
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getResults(): BenchmarkResult[] {
    return [...this.results]
  }

  getLatestResult(): BenchmarkResult | undefined {
    return this.results[this.results.length - 1]
  }

  clearResults(): void {
    this.results = []
  }

  generateReport(): string {
    if (this.results.length === 0) {
      return 'No benchmark results available'
    }

    let report = '# Benchmark Report\n\n'
    
    for (const result of this.results) {
      report += `## ${result.name}\n\n`
      report += `- **Protocol**: ${result.protocol}\n`
      report += `- **Duration**: ${result.duration.toFixed(2)}s\n`
      report += `- **Concurrency**: ${result.concurrency}\n`
      report += `- **Total Messages**: ${result.totalMessages}\n`
      report += `- **Successful Messages**: ${result.successfulMessages}\n`
      report += `- **Failed Messages**: ${result.failedMessages}\n`
      report += `- **Throughput**: ${result.throughput.toFixed(2)} msg/s\n`
      report += `- **Error Rate**: ${(result.errorRate * 100).toFixed(2)}%\n`
      report += `- **Latency (ms)**:\n`
      report += `  - Min: ${result.latency.min.toFixed(2)}\n`
      report += `  - Max: ${result.latency.max.toFixed(2)}\n`
      report += `  - Average: ${result.latency.average.toFixed(2)}\n`
      report += `  - P50: ${result.latency.p50.toFixed(2)}\n`
      report += `  - P90: ${result.latency.p90.toFixed(2)}\n`
      report += `  - P95: ${result.latency.p95.toFixed(2)}\n`
      report += `  - P99: ${result.latency.p99.toFixed(2)}\n`
      report += `- **Resource Usage**:\n`
      report += `  - CPU: ${result.resourceUsage.cpu}μs\n`
      report += `  - Memory: ${(result.resourceUsage.memory / 1024 / 1024).toFixed(2)}MB\n`
      report += `- **Timestamp**: ${result.timestamp.toISOString()}\n\n`
    }

    return report
  }
}

export function createBenchmarkRunner(
  logger: StructuredLogger,
  metrics?: MetricsCollector
): BenchmarkRunner {
  return new BenchmarkRunner(logger, metrics)
}