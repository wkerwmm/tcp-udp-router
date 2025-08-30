import { Container } from '../container'
import { MetricsCollector } from '../metrics'

export interface HealthCheck {
  name: string
  check(): Promise<{ status: 'healthy' | 'unhealthy'; details?: any }>
}

export interface MonitoringSystem {
  registerHealthCheck(healthCheck: HealthCheck): void
  getHealthStatus(): Promise<Map<string, { status: string; details?: any }>>
  getMetrics(): Promise<string>
  getSystemInfo(): SystemInfo
}

export interface SystemInfo {
  version: string
  uptime: number
  memory: {
    total: number
    free: number
    used: number
  }
  cpu: {
    usage: number
    cores: number
  }
  connections: {
    tcp: number
    udp: number
  }
}

export class DefaultMonitoringSystem implements MonitoringSystem {
  private healthChecks: Map<string, HealthCheck>
  private metricsCollector: MetricsCollector
  private container: Container

  constructor(container: Container) {
    this.healthChecks = new Map()
    this.container = container
    this.metricsCollector = container.resolve<MetricsCollector>('metrics')
  }

  registerHealthCheck(healthCheck: HealthCheck): void {
    this.healthChecks.set(healthCheck.name, healthCheck)
  }

  async getHealthStatus(): Promise<Map<string, { status: string; details?: any }>> {
    const results = new Map<string, { status: string; details?: any }>()

    for (const [name, check] of this.healthChecks) {
      try {
        const result = await check.check()
        results.set(name, result)
      } catch (error) {
        results.set(name, { 
          status: 'unhealthy', 
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
      }
    }

    return results
  }

  async getMetrics(): Promise<string> {
    const { register } = await import('prom-client')
    return register.metrics()
  }

  getSystemInfo(): SystemInfo {
    const os = require('os')
    const process = require('process')

    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    return {
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem
      },
      cpu: {
        usage: os.loadavg()[0],
        cores: os.cpus().length
      },
      connections: {
        tcp: 0,
        udp: 0
      }
    }
  }
}

export function createMonitoringSystem(container: Container): MonitoringSystem {
  const monitoringSystem = new DefaultMonitoringSystem(container)
  container.registerSingleton('monitoring', monitoringSystem)
  return monitoringSystem
}

export function setupMonitoring(container: Container): MonitoringSystem {
  const monitoringSystem = createMonitoringSystem(container)
  
  const healthChecks = createDefaultHealthChecks(container)
  healthChecks.forEach(check => monitoringSystem.registerHealthCheck(check))
  
  return monitoringSystem
}

export function createDefaultHealthChecks(container: Container): HealthCheck[] {
  return [
    {
      name: 'tcp_server',
      async check() {
        try {
          const tcpServer = container.resolve<any>('tcpServer')
          return { status: 'healthy', details: { port: tcpServer.port } }
        } catch {
          return { status: 'unhealthy', details: { error: 'TCP server not available' } }
        }
      }
    },
    {
      name: 'udp_server',
      async check() {
        try {
          const udpServer = container.resolve<any>('udpServer')
          return { status: 'healthy', details: { port: udpServer.port } }
        } catch {
          return { status: 'unhealthy', details: { error: 'UDP server not available' } }
        }
      }
    },
    {
      name: 'plugin_system',
      async check() {
        try {
          const pluginManager = container.resolve<any>('pluginManager')
          const plugins = pluginManager.getAllPlugins()
          return { status: 'healthy', details: { loadedPlugins: plugins.length } }
        } catch {
          return { status: 'unhealthy', details: { error: 'Plugin system not available' } }
        }
      }
    }
  ]
}
