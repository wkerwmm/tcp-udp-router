import { Container } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

type RouteRule = (context: any) => boolean
type RouteHandler = (context: any) => Promise<void> | void

export class Router {
  private routes: { rule: RouteRule; handler: RouteHandler; name: string }[]
  private logger: StructuredLogger
  private metrics?: MetricsCollector

  constructor(container: Container) {
    this.routes = []
    this.logger = container.resolve<StructuredLogger>('logger')
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }
  }

  addRoute(name: string, rule: RouteRule, handler: RouteHandler) {
    this.routes.push({ rule, handler, name })
    this.logger.debug('Route added', { routeName: name })
  }

  async route(context: any): Promise<boolean> {
    for (const { rule, handler, name } of this.routes) {
      if (rule(context)) {
        const startTime = Date.now()
        
        try {
          await handler(context)
          
          const processingTime = Date.now() - startTime
          this.metrics?.incrementRouterMatch(name)
          this.metrics?.recordProcessingTime(context.protocol, processingTime / 1000)
          
          this.logger.debug('Route matched', {
            routeName: name,
            sessionId: context.sessionId,
            protocol: context.protocol,
            processingTime
          })
          
          return true
        } catch (error) {
          const processingTime = Date.now() - startTime
          this.metrics?.incrementError('route_error', name)
          
          this.logger.error('Route execution error', {
            routeName: name,
            sessionId: context.sessionId,
            protocol: context.protocol,
            processingTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          
          throw error
        }
      }
    }
    
    this.logger.warn('No route matched', {
      sessionId: context.sessionId,
      protocol: context.protocol
    })
    
    this.metrics?.incrementError('no_route', 'router')
    return false
  }

  getRoutes(): { name: string; rule: string }[] {
    return this.routes.map(route => ({
      name: route.name,
      rule: route.rule.toString()
    }))
  }

  hasRoute(name: string): boolean {
    return this.routes.some(route => route.name === name)
  }

  removeRoute(name: string): boolean {
    const index = this.routes.findIndex(route => route.name === name)
    if (index !== -1) {
      this.routes.splice(index, 1)
      this.logger.debug('Route removed', { routeName: name })
      return true
    }
    return false
  }

  clearRoutes(): void {
    const count = this.routes.length
    this.routes = []
    this.logger.info('All routes cleared', { routesCleared: count })
  }
}

export function createDefaultRouter(container: Container): Router {
  const router = new Router(container)
  
  router.addRoute('echo', (context) => {
    return context.data && context.data.length > 0
  }, async (context) => {
    if (context.protocol === 'tcp' && context.socket) {
      context.socket.write(context.data)
    } else if (context.protocol === 'udp' && context.server && context.rinfo) {
      context.server.send(context.data, context.rinfo.port, context.rinfo.address)
    }
  })
  
  router.addRoute('health_check', (context) => {
    const data = context.data.toString().trim()
    return data === 'health' || data === 'ping'
  }, async (context) => {
    const response = Buffer.from('OK\n')
    if (context.protocol === 'tcp' && context.socket) {
      context.socket.write(response)
    } else if (context.protocol === 'udp' && context.server && context.rinfo) {
      context.server.send(response, context.rinfo.port, context.rinfo.address)
    }
  })
  
  router.addRoute('metrics_request', (context) => {
    const data = context.data.toString().trim()
    return data === 'metrics' || data === 'stats'
  }, async (context) => {
    const sessionStore = container.resolve<any>('sessionStore')
    const stats = sessionStore.getSessionCount()
    const response = Buffer.from(`TCP: ${stats.tcp}, UDP: ${stats.udp}\n`)
    
    if (context.protocol === 'tcp' && context.socket) {
      context.socket.write(response)
    } else if (context.protocol === 'udp' && context.server && context.rinfo) {
      context.server.send(response, context.rinfo.port, context.rinfo.address)
    }
  })
  
  return router
}
