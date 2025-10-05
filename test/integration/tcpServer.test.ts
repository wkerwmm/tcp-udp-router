import { expect } from 'chai'
import { TCPServer } from '../../src/net/tcpServer'
import { createContainer } from '../../src/container'
import { createLogger } from '../../src/logger'
import { createConfigManager } from '../../src/config'
import { SessionStore } from '../../src/core/sessionStore'
import { createDefaultRouter } from '../../src/core/router'
import { createPipeline } from '../../src/pipeline'
import { createSecurityManager } from '../../src/security/securityManager'
import { createSecurityPipeline } from '../../src/security/securityMiddleware'
import { connect, Socket } from 'net'

describe('TCPServer Integration Tests', () => {
  let tcpServer: TCPServer
  let container: any
  let serverPort: number

  beforeEach(async () => {
    container = createContainer()
    
    // Setup container with required services
    const logger = createLogger('error')
    container.registerSingleton('logger', logger)
    
    const config = {
      TCP_PORT: '0', // Use random port
      LOG_LEVEL: 'error',
      METRICS_ENABLED: false,
      ENABLE_IP_FILTERING: false,
      ENABLE_RATE_LIMITING: false
    }
    container.registerSingleton('config', config)
    container.registerSingleton('configManager', createConfigManager(config))
    
    const sessionStore = new SessionStore(container)
    container.registerSingleton('sessionStore', sessionStore)
    
    const router = createDefaultRouter(container)
    container.registerSingleton('router', router)
    
    const pipeline = createPipeline()
    container.registerSingleton('pipeline', pipeline)
    
    const securityManager = createSecurityManager(logger, undefined, undefined, {
      enableIPFiltering: false,
      enableRateLimiting: false
    })
    container.registerSingleton('securityManager', securityManager)
    
    const securityPipeline = createSecurityPipeline(securityManager, logger)
    container.registerSingleton('securityPipeline', securityPipeline)
    
    // Create server with random port
    tcpServer = new TCPServer(0, container)
    container.registerSingleton('tcpServer', tcpServer)
  })

  afterEach(async () => {
    if (tcpServer) {
      await tcpServer.dispose()
    }
  })

  describe('Server Lifecycle', () => {
    it('should start and stop server', async () => {
      await tcpServer.start()
      expect(tcpServer.getPort()).to.be.greaterThan(0)
      
      await tcpServer.stop()
    })

    it('should handle multiple start/stop cycles', async () => {
      await tcpServer.start()
      const port1 = tcpServer.getPort()
      await tcpServer.stop()
      
      await tcpServer.start()
      const port2 = tcpServer.getPort()
      await tcpServer.stop()
      
      expect(port1).to.not.equal(port2)
    })
  })

  describe('Connection Handling', () => {
    it('should accept TCP connections', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      return new Promise((resolve, reject) => {
        const client = connect(serverPort, 'localhost')
        
        client.on('connect', () => {
          client.end()
          resolve()
        })
        
        client.on('error', reject)
      })
    })

    it('should handle multiple concurrent connections', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      const connectionCount = 5
      const connections: Socket[] = []
      
      return new Promise((resolve, reject) => {
        let connectedCount = 0
        
        for (let i = 0; i < connectionCount; i++) {
          const client = connect(serverPort, 'localhost')
          connections.push(client)
          
          client.on('connect', () => {
            connectedCount++
            if (connectedCount === connectionCount) {
              // Close all connections
              connections.forEach(conn => conn.end())
              resolve()
            }
          })
          
          client.on('error', reject)
        }
      })
    })

    it('should track active connections', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      expect(tcpServer.getActiveConnectionsCount()).to.equal(0)
      
      const client = connect(serverPort, 'localhost')
      
      return new Promise((resolve) => {
        client.on('connect', () => {
          // Give server time to register connection
          setTimeout(() => {
            expect(tcpServer.getActiveConnectionsCount()).to.be.greaterThan(0)
            client.end()
            resolve()
          }, 100)
        })
      })
    })
  })

  describe('Message Processing', () => {
    it('should process incoming messages', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      return new Promise((resolve, reject) => {
        const client = connect(serverPort, 'localhost')
        const testMessage = 'test message'
        
        client.on('connect', () => {
          client.write(testMessage)
        })
        
        client.on('data', (data) => {
          expect(data.toString()).to.equal(testMessage) // Echo server should echo back
          client.end()
          resolve()
        })
        
        client.on('error', reject)
      })
    })

    it('should handle health check messages', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      return new Promise((resolve, reject) => {
        const client = connect(serverPort, 'localhost')
        
        client.on('connect', () => {
          client.write('health')
        })
        
        client.on('data', (data) => {
          expect(data.toString().trim()).to.equal('OK')
          client.end()
          resolve()
        })
        
        client.on('error', reject)
      })
    })

    it('should handle metrics request messages', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      return new Promise((resolve, reject) => {
        const client = connect(serverPort, 'localhost')
        
        client.on('connect', () => {
          client.write('metrics')
        })
        
        client.on('data', (data) => {
          const response = data.toString().trim()
          expect(response).to.match(/TCP: \d+, UDP: \d+/)
          client.end()
          resolve()
        })
        
        client.on('error', reject)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle client disconnections gracefully', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      const client = connect(serverPort, 'localhost')
      
      return new Promise((resolve) => {
        client.on('connect', () => {
          client.destroy() // Force disconnect
          setTimeout(() => {
            expect(tcpServer.getActiveConnectionsCount()).to.equal(0)
            resolve()
          }, 100)
        })
      })
    })

    it('should handle malformed data gracefully', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      return new Promise((resolve, reject) => {
        const client = connect(serverPort, 'localhost')
        
        client.on('connect', () => {
          // Send malformed data
          client.write(Buffer.from([0xFF, 0xFE, 0xFD]))
          client.end()
          resolve()
        })
        
        client.on('error', reject)
      })
    })
  })

  describe('Resource Management', () => {
    it('should clean up resources on disposal', async () => {
      await tcpServer.start()
      serverPort = tcpServer.getPort()
      
      const client = connect(serverPort, 'localhost')
      
      return new Promise((resolve) => {
        client.on('connect', () => {
          client.end()
        })
        
        client.on('close', async () => {
          await tcpServer.dispose()
          expect(tcpServer.getActiveConnectionsCount()).to.equal(0)
          resolve()
        })
      })
    })
  })
})