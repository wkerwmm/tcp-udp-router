import express from 'express'
import { StructuredLogger } from './logger'
import { SecurityManager } from './security/securityManager'
import { MetricsCollector } from './metrics'

export interface HealthCheckConfig {
  enableAuth: boolean
  secret?: string
  enableDetailedStatus: boolean
  enableMetrics: boolean
}

export function startHttpServer(
  port: string, 
  logger: StructuredLogger,
  securityManager?: SecurityManager,
  metrics?: MetricsCollector,
  config?: HealthCheckConfig
) {
  const app = express()
  
  // Middleware for parsing JSON
  app.use(express.json())
  
  // Basic health check endpoint
  app.get('/health', (req, res) => {
    try {
      // Check authentication if enabled
      if (config?.enableAuth && securityManager) {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string
        if (!securityManager.validateHealthCheckAuth(token)) {
          return res.status(401).json({ 
            status: 'error', 
            message: 'Unauthorized',
            timestamp: new Date().toISOString()
          })
        }
      }

      const healthData: any = {
        status: 'healthy',
        timestamp: new Date().toISOString()
      }

      // Add detailed status if enabled
      if (config?.enableDetailedStatus) {
        healthData.uptime = process.uptime()
        healthData.memory = process.memoryUsage()
        healthData.version = process.version
        
        if (securityManager) {
          healthData.security = securityManager.getSecurityStats()
        }
      }

      // Add metrics if enabled
      if (config?.enableMetrics && metrics) {
        // This would need to be implemented in the metrics collector
        healthData.metrics = {
          note: 'Detailed metrics available at /metrics endpoint'
        }
      }

      res.json(healthData)
    } catch (error) {
      logger.error('Health check error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      })
    }
  })

  // Detailed health check endpoint (requires authentication)
  app.get('/health/detailed', (req, res) => {
    try {
      // Always require authentication for detailed health check
      if (securityManager) {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string
        if (!securityManager.validateHealthCheckAuth(token)) {
          return res.status(401).json({ 
            status: 'error', 
            message: 'Unauthorized',
            timestamp: new Date().toISOString()
          })
        }
      }

      const detailedHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        security: securityManager?.getSecurityStats(),
        environment: {
          nodeEnv: process.env.NODE_ENV || 'development',
          port: process.env.PORT || 'unknown'
        }
      }

      res.json(detailedHealth)
    } catch (error) {
      logger.error('Detailed health check error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      })
    }
  })

  // Readiness check endpoint
  app.get('/ready', (req, res) => {
    try {
      // Basic readiness check - can be extended with more sophisticated checks
      const isReady = true // Add your readiness logic here
      
      if (isReady) {
        res.json({ 
          status: 'ready', 
          timestamp: new Date().toISOString() 
        })
      } else {
        res.status(503).json({ 
          status: 'not ready', 
          timestamp: new Date().toISOString() 
        })
      }
    } catch (error) {
      logger.error('Readiness check error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      res.status(503).json({
        status: 'not ready',
        message: 'Readiness check failed',
        timestamp: new Date().toISOString()
      })
    }
  })

  // Liveness check endpoint
  app.get('/live', (req, res) => {
    try {
      // Basic liveness check
      res.json({ 
        status: 'alive', 
        timestamp: new Date().toISOString() 
      })
    } catch (error) {
      logger.error('Liveness check error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      res.status(500).json({
        status: 'error',
        message: 'Liveness check failed',
        timestamp: new Date().toISOString()
      })
    }
  })

  app.listen(port, () => {
    logger.info(`HTTP Health server listening on port ${port}`, {
      port,
      endpoints: ['/health', '/health/detailed', '/ready', '/live'],
      authEnabled: config?.enableAuth || false
    })
  })

  return app
}
