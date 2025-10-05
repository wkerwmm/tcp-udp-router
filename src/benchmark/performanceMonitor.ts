import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export interface PerformanceMetrics {
  timestamp: Date
  cpu: {
    usage: number
    loadAverage: number[]
  }
  memory: {
    used: number
    total: number
    heapUsed: number
    heapTotal: number
    external: number
  }
  network: {
    bytesReceived: number
    bytesSent: number
    packetsReceived: number
    packetsSent: number
  }
  connections: {
    tcp: number
    udp: number
    total: number
  }
  throughput: {
    messagesPerSecond: number
    bytesPerSecond: number
  }
  latency: {
    average: number
    p95: number
    p99: number
  }
}

export interface PerformanceAlert {
  type: 'cpu' | 'memory' | 'latency' | 'throughput' | 'connections'
  level: 'warning' | 'critical'
  message: string
  value: number
  threshold: number
  timestamp: Date
}

export class PerformanceMonitor {
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private isMonitoring: boolean = false
  private monitoringInterval?: NodeJS.Timeout
  private metricsHistory: PerformanceMetrics[] = []
  private alerts: PerformanceAlert[] = []
  private startTime: number = 0
  private lastCpuUsage: NodeJS.CpuUsage | null = null
  private lastNetworkStats: any = null

  // Thresholds
  private thresholds = {
    cpuUsage: 80, // percentage
    memoryUsage: 85, // percentage
    latencyP95: 1000, // milliseconds
    latencyP99: 2000, // milliseconds
    connectionCount: 1000,
    errorRate: 0.05 // 5%
  }

  constructor(logger: StructuredLogger, metrics?: MetricsCollector) {
    this.logger = logger
    this.metrics = metrics
  }

  start(intervalMs: number = 5000): void {
    if (this.isMonitoring) {
      this.logger.warn('Performance monitoring already started')
      return
    }

    this.isMonitoring = true
    this.startTime = Date.now()
    this.lastCpuUsage = process.cpuUsage()

    this.logger.info('Performance monitoring started', { intervalMs })

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
    }, intervalMs)
  }

  stop(): void {
    if (!this.isMonitoring) {
      this.logger.warn('Performance monitoring not started')
      return
    }

    this.isMonitoring = false
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }

    this.logger.info('Performance monitoring stopped', {
      duration: Date.now() - this.startTime,
      metricsCollected: this.metricsHistory.length
    })
  }

  private collectMetrics(): void {
    try {
      const metrics = this.gatherSystemMetrics()
      this.metricsHistory.push(metrics)

      // Keep only last 1000 metrics to prevent memory issues
      if (this.metricsHistory.length > 1000) {
        this.metricsHistory = this.metricsHistory.slice(-1000)
      }

      // Check for alerts
      this.checkAlerts(metrics)

      // Record metrics
      this.recordMetrics(metrics)

    } catch (error) {
      this.logger.error('Failed to collect performance metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private gatherSystemMetrics(): PerformanceMetrics {
    const now = Date.now()
    const memory = process.memoryUsage()
    const cpuUsage = process.cpuUsage(this.lastCpuUsage)
    this.lastCpuUsage = process.cpuUsage()

    // Calculate CPU usage percentage
    const cpuUsagePercent = (cpuUsage.user + cpuUsage.system) / 1000000 // Convert to seconds
    const timeDiff = (now - (this.lastCpuUsage ? this.lastCpuUsage.user : 0)) / 1000
    const cpuPercent = Math.min(100, Math.max(0, (cpuUsagePercent / timeDiff) * 100))

    return {
      timestamp: new Date(),
      cpu: {
        usage: cpuPercent,
        loadAverage: process.platform === 'win32' ? [] : require('os').loadavg()
      },
      memory: {
        used: memory.rss,
        total: require('os').totalmem(),
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external
      },
      network: this.getNetworkStats(),
      connections: this.getConnectionStats(),
      throughput: this.getThroughputStats(),
      latency: this.getLatencyStats()
    }
  }

  private getNetworkStats(): PerformanceMetrics['network'] {
    // This would need to be implemented based on your specific needs
    // For now, return placeholder values
    return {
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0
    }
  }

  private getConnectionStats(): PerformanceMetrics['connections'] {
    // This would need to be implemented based on your specific needs
    // For now, return placeholder values
    return {
      tcp: 0,
      udp: 0,
      total: 0
    }
  }

  private getThroughputStats(): PerformanceMetrics['throughput'] {
    // This would need to be implemented based on your specific needs
    // For now, return placeholder values
    return {
      messagesPerSecond: 0,
      bytesPerSecond: 0
    }
  }

  private getLatencyStats(): PerformanceMetrics['latency'] {
    // This would need to be implemented based on your specific needs
    // For now, return placeholder values
    return {
      average: 0,
      p95: 0,
      p99: 0
    }
  }

  private checkAlerts(metrics: PerformanceMetrics): void {
    // CPU usage alert
    if (metrics.cpu.usage > this.thresholds.cpuUsage) {
      this.addAlert({
        type: 'cpu',
        level: metrics.cpu.usage > 95 ? 'critical' : 'warning',
        message: `High CPU usage: ${metrics.cpu.usage.toFixed(2)}%`,
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpuUsage,
        timestamp: new Date()
      })
    }

    // Memory usage alert
    const memoryUsagePercent = (metrics.memory.used / metrics.memory.total) * 100
    if (memoryUsagePercent > this.thresholds.memoryUsage) {
      this.addAlert({
        type: 'memory',
        level: memoryUsagePercent > 95 ? 'critical' : 'warning',
        message: `High memory usage: ${memoryUsagePercent.toFixed(2)}%`,
        value: memoryUsagePercent,
        threshold: this.thresholds.memoryUsage,
        timestamp: new Date()
      })
    }

    // Latency alerts
    if (metrics.latency.p95 > this.thresholds.latencyP95) {
      this.addAlert({
        type: 'latency',
        level: metrics.latency.p95 > this.thresholds.latencyP99 ? 'critical' : 'warning',
        message: `High P95 latency: ${metrics.latency.p95.toFixed(2)}ms`,
        value: metrics.latency.p95,
        threshold: this.thresholds.latencyP95,
        timestamp: new Date()
      })
    }

    if (metrics.latency.p99 > this.thresholds.latencyP99) {
      this.addAlert({
        type: 'latency',
        level: 'critical',
        message: `High P99 latency: ${metrics.latency.p99.toFixed(2)}ms`,
        value: metrics.latency.p99,
        threshold: this.thresholds.latencyP99,
        timestamp: new Date()
      })
    }

    // Connection count alert
    if (metrics.connections.total > this.thresholds.connectionCount) {
      this.addAlert({
        type: 'connections',
        level: metrics.connections.total > this.thresholds.connectionCount * 1.5 ? 'critical' : 'warning',
        message: `High connection count: ${metrics.connections.total}`,
        value: metrics.connections.total,
        threshold: this.thresholds.connectionCount,
        timestamp: new Date()
      })
    }
  }

  private addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert)
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }

    // Log alert
    const logLevel = alert.level === 'critical' ? 'error' : 'warn'
    this.logger[logLevel]('Performance alert', {
      type: alert.type,
      level: alert.level,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold
    })
  }

  private recordMetrics(metrics: PerformanceMetrics): void {
    if (!this.metrics) return

    // Record CPU usage
    this.metrics.incrementError('cpu_usage', 'performance_monitor')
    
    // Record memory usage
    this.metrics.incrementError('memory_usage', 'performance_monitor')
    
    // Record latency
    this.metrics.incrementError('latency_p95', 'performance_monitor')
    this.metrics.incrementError('latency_p99', 'performance_monitor')
  }

  getCurrentMetrics(): PerformanceMetrics | undefined {
    return this.metricsHistory[this.metricsHistory.length - 1]
  }

  getMetricsHistory(limit?: number): PerformanceMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit)
    }
    return [...this.metricsHistory]
  }

  getAlerts(level?: 'warning' | 'critical'): PerformanceAlert[] {
    if (level) {
      return this.alerts.filter(alert => alert.level === level)
    }
    return [...this.alerts]
  }

  getRecentAlerts(minutes: number = 60): PerformanceAlert[] {
    const cutoff = Date.now() - (minutes * 60 * 1000)
    return this.alerts.filter(alert => alert.timestamp.getTime() > cutoff)
  }

  setThreshold(type: keyof typeof PerformanceMonitor.prototype.thresholds, value: number): void {
    this.thresholds[type] = value
    this.logger.info('Performance threshold updated', { type, value })
  }

  getThresholds(): typeof PerformanceMonitor.prototype.thresholds {
    return { ...this.thresholds }
  }

  generateReport(): string {
    const current = this.getCurrentMetrics()
    if (!current) {
      return 'No performance data available'
    }

    let report = '# Performance Report\n\n'
    report += `**Generated**: ${new Date().toISOString()}\n\n`
    
    report += '## Current Status\n\n'
    report += `- **CPU Usage**: ${current.cpu.usage.toFixed(2)}%\n`
    report += `- **Memory Usage**: ${((current.memory.used / current.memory.total) * 100).toFixed(2)}%\n`
    report += `- **Heap Usage**: ${((current.memory.heapUsed / current.memory.heapTotal) * 100).toFixed(2)}%\n`
    report += `- **Connections**: ${current.connections.total} (TCP: ${current.connections.tcp}, UDP: ${current.connections.udp})\n`
    report += `- **Throughput**: ${current.throughput.messagesPerSecond.toFixed(2)} msg/s\n`
    report += `- **Latency P95**: ${current.latency.p95.toFixed(2)}ms\n`
    report += `- **Latency P99**: ${current.latency.p99.toFixed(2)}ms\n\n`

    const recentAlerts = this.getRecentAlerts(60)
    if (recentAlerts.length > 0) {
      report += '## Recent Alerts (Last 60 minutes)\n\n'
      for (const alert of recentAlerts) {
        report += `- **${alert.level.toUpperCase()}** [${alert.type}]: ${alert.message}\n`
      }
      report += '\n'
    }

    return report
  }

  clearHistory(): void {
    this.metricsHistory = []
    this.alerts = []
    this.logger.info('Performance history cleared')
  }
}

export function createPerformanceMonitor(
  logger: StructuredLogger,
  metrics?: MetricsCollector
): PerformanceMonitor {
  return new PerformanceMonitor(logger, metrics)
}