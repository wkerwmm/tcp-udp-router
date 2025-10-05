import { createSocket, Socket } from 'dgram'
import { Container, Disposable } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'
import { ErrorHandler, RouterError, ErrorType, ErrorSeverity, createErrorHandler } from '../core/errorHandler'
import { ResourceManager, Resource } from '../core/resourceManager'

export class UDPServer implements Disposable {
  private server: Socket
  private port: number
  private container: Container
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private activeSessions: Map<string, number>
  private errorHandler: ErrorHandler
  private resourceManager: ResourceManager
  private isShuttingDown: boolean
  private messageTimeouts: Map<string, NodeJS.Timeout>

  constructor(port: number, container: Container) {
    this.port = port
    this.container = container
    this.server = createSocket('udp4')
    this.logger = container.resolve<StructuredLogger>('logger')
    this.activeSessions = new Map()
    this.isShuttingDown = false
    this.messageTimeouts = new Map()
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }

    this.errorHandler = createErrorHandler(this.logger, this.metrics)
    this.resourceManager = new ResourceManager(this.logger, this.metrics)
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.bind(this.port, () => {
        this.logger.info('UDP Server listening', { port: this.port })
        resolve()
      })

      this.server.on('message', (msg: Buffer, rinfo: any) => {
        this.handleMessage(msg, rinfo)
      })

      this.server.on('error', (err) => {
        this.errorHandler.handleError(err, {
          component: 'udp_server',
          operation: 'start',
          remoteAddress: 'server'
        })
        reject(err)
      })

      this.server.on('listening', () => {
        const address = this.server.address()
        this.logger.info('UDP Server started', { 
          address: address.address, 
          port: address.port,
          family: address.family
        })
      })

      // Set socket timeout
      this.server.setTimeout(30000, () => {
        this.logger.warn('UDP Server timeout')
      })
    })
  }

  private handleMessage(msg: Buffer, rinfo: any) {
    if (this.isShuttingDown) {
      return
    }

    const sessionStore = this.container.resolve<any>('sessionStore')
    const router = this.container.resolve<any>('router')
    const pipeline = this.container.resolve<any>('pipeline')

    const sessionId = sessionStore.getOrCreateUdpSession(rinfo)
    const sessionKey = `${rinfo.address}:${rinfo.port}`
    
    if (!this.activeSessions.has(sessionKey)) {
      this.activeSessions.set(sessionKey, 1)
      this.metrics?.incrementUdpConnections('active')
      
      // Create session resource
      const sessionResource: Resource = {
        id: `udp_session_${sessionKey}`,
        type: 'udp_session',
        isDisposed: false,
        createdAt: new Date(),
        metadata: {
          sessionId,
          remoteAddress: rinfo.address,
          remotePort: rinfo.port
        },
        dispose: async () => {
          this.activeSessions.delete(sessionKey)
          this.metrics?.decrementUdpConnections('active')
        }
      }
      
      this.resourceManager.registerResource(sessionResource)
    } else {
      this.activeSessions.set(sessionKey, this.activeSessions.get(sessionKey)! + 1)
    }

    this.logger.info('UDP message received', { 
      sessionId,
      remoteAddress: rinfo.address,
      remotePort: rinfo.port,
      messageSize: msg.length
    })

    const startTime = Date.now()
    
    try {
      const context = {
        sessionId,
        data: msg,
        rinfo,
        protocol: 'udp',
        server: this.server,
        remoteAddress: rinfo.address,
        remotePort: rinfo.port
      }

      this.errorHandler.executeWithRetry(
        () => pipeline.process(context),
        {
          sessionId,
          component: 'udp_server',
          operation: 'process_message',
          protocol: 'udp',
          remoteAddress: rinfo.address,
          remotePort: rinfo.port
        }
      ).then(() => {
        const processingTime = Date.now() - startTime
        this.metrics?.recordProcessingTime('udp', processingTime / 1000)
        this.metrics?.recordMessageSize('udp', msg.length)
        this.metrics?.incrementMessagesProcessed('udp', 'success')
      }).catch((error) => {
        const processingTime = Date.now() - startTime
        this.metrics?.recordProcessingTime('udp', processingTime / 1000)
        this.metrics?.incrementMessagesProcessed('udp', 'error')
        
        this.errorHandler.handleError(error, {
          sessionId,
          component: 'udp_server',
          operation: 'process_message',
          protocol: 'udp',
          remoteAddress: rinfo.address,
          remotePort: rinfo.port
        })
      })
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      this.metrics?.recordProcessingTime('udp', processingTime / 1000)
      this.metrics?.incrementMessagesProcessed('udp', 'error')
      
      this.errorHandler.handleError(error as Error, {
        sessionId,
        component: 'udp_server',
        operation: 'process_message',
        protocol: 'udp',
        remoteAddress: rinfo.address,
        remotePort: rinfo.port
      })
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true
    
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('UDP Server stopped')
        resolve()
      })
    })
  }

  async dispose(): Promise<void> {
    this.isShuttingDown = true
    
    try {
      // Dispose all session resources
      await this.resourceManager.disposeResourcesByType('udp_session')
      
      // Clear all timeouts
      for (const timeout of this.messageTimeouts.values()) {
        clearTimeout(timeout)
      }
      this.messageTimeouts.clear()
      
      // Clear active sessions
      this.activeSessions.clear()
      
      // Dispose all resources
      await this.resourceManager.disposeAllResources()
      
      this.logger.info('UDP Server disposed successfully')
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        component: 'udp_server',
        operation: 'dispose',
        protocol: 'udp'
      })
    }
  }

  getActiveSessionsCount(): number {
    return this.activeSessions.size
  }

  getPort(): number {
    return this.port
  }

  getMessageCountForSession(address: string, port: number): number {
    const sessionKey = `${address}:${port}`
    return this.activeSessions.get(sessionKey) || 0
  }
}
