import { Server, Socket } from 'net'
import { Container, Disposable } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'
import { ErrorHandler, RouterError, ErrorType, ErrorSeverity, createErrorHandler } from '../core/errorHandler'
import { ResourceManager, Resource } from '../core/resourceManager'

export class TCPServer implements Disposable {
  private server: Server
  private port: number
  private container: Container
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private activeConnections: Map<string, Socket>
  private errorHandler: ErrorHandler
  private resourceManager: ResourceManager
  private isShuttingDown: boolean
  private connectionTimeouts: Map<string, NodeJS.Timeout>

  constructor(port: number, container: Container) {
    this.port = port
    this.container = container
    this.server = new Server()
    this.logger = container.resolve<StructuredLogger>('logger')
    this.activeConnections = new Map()
    this.isShuttingDown = false
    this.connectionTimeouts = new Map()
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }

    this.errorHandler = createErrorHandler(this.logger, this.metrics)
    this.resourceManager = new ResourceManager(this.logger, this.metrics)
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        this.logger.info('TCP Server listening', { port: this.port })
        resolve()
      })

      this.server.on('connection', (socket: Socket) => {
        this.handleConnection(socket)
      })

      this.server.on('error', (err) => {
        this.errorHandler.handleError(err, {
          component: 'tcp_server',
          operation: 'start',
          remoteAddress: 'server'
        })
        reject(err)
      })

      // Set server timeout
      this.server.setTimeout(30000, () => {
        this.logger.warn('TCP Server timeout')
      })
    })
  }

  private handleConnection(socket: Socket) {
    if (this.isShuttingDown) {
      socket.destroy()
      return
    }

    const sessionStore = this.container.resolve<any>('sessionStore')
    const router = this.container.resolve<any>('router')
    const pipeline = this.container.resolve<any>('pipeline')

    const sessionId = sessionStore.createSession(socket)
    this.activeConnections.set(sessionId, socket)
    
    // Set socket timeout
    socket.setTimeout(30000)
    
    // Create connection resource
    const connectionResource: Resource = {
      id: `tcp_connection_${sessionId}`,
      type: 'tcp_connection',
      isDisposed: false,
      createdAt: new Date(),
      metadata: {
        sessionId,
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort
      },
      dispose: async () => {
        try {
          if (!socket.destroyed) {
            socket.destroy()
          }
        } catch (error) {
          this.logger.error('Error disposing TCP connection resource', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    }
    
    this.resourceManager.registerResource(connectionResource)
    
    this.logger.info('New TCP connection', { 
      sessionId, 
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort
    })
    
    this.metrics?.incrementTcpConnections('active')

    socket.on('data', async (data: Buffer) => {
      const startTime = Date.now()
      
      try {
        const context = {
          sessionId,
          data,
          socket,
          protocol: 'tcp',
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort
        }

        await this.errorHandler.executeWithRetry(
          () => pipeline.process(context),
          {
            sessionId,
            component: 'tcp_server',
            operation: 'process_message',
            protocol: 'tcp',
            remoteAddress: socket.remoteAddress,
            remotePort: socket.remotePort
          }
        )
        
        const processingTime = Date.now() - startTime
        this.metrics?.recordProcessingTime('tcp', processingTime / 1000)
        this.metrics?.recordMessageSize('tcp', data.length)
        this.metrics?.incrementMessagesProcessed('tcp', 'success')
        
      } catch (error) {
        const processingTime = Date.now() - startTime
        this.metrics?.recordProcessingTime('tcp', processingTime / 1000)
        this.metrics?.incrementMessagesProcessed('tcp', 'error')
        
        this.errorHandler.handleError(error as Error, {
          sessionId,
          component: 'tcp_server',
          operation: 'process_message',
          protocol: 'tcp',
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort
        })
      }
    })

    socket.on('close', () => {
      this.cleanupConnection(sessionId)
    })

    socket.on('error', (err) => {
      this.errorHandler.handleError(err, {
        sessionId,
        component: 'tcp_server',
        operation: 'connection',
        protocol: 'tcp',
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort
      })
    })

    socket.on('timeout', () => {
      this.logger.warn('TCP connection timeout', { sessionId })
      this.cleanupConnection(sessionId)
    })
  }

  private cleanupConnection(sessionId: string): void {
    try {
      const socket = this.activeConnections.get(sessionId)
      if (socket) {
        const sessionStore = this.container.resolve<any>('sessionStore')
        sessionStore.removeSession(sessionId)
        this.activeConnections.delete(sessionId)
        
        // Clear timeout if exists
        const timeout = this.connectionTimeouts.get(sessionId)
        if (timeout) {
          clearTimeout(timeout)
          this.connectionTimeouts.delete(sessionId)
        }
        
        // Dispose connection resource
        this.resourceManager.disposeResource(`tcp_connection_${sessionId}`)
        
        this.logger.info('TCP connection cleaned up', { sessionId })
        this.metrics?.decrementTcpConnections('active')
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        sessionId,
        component: 'tcp_server',
        operation: 'cleanup_connection',
        protocol: 'tcp'
      })
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true
    
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('TCP Server stopped')
        resolve()
      })
    })
  }

  async dispose(): Promise<void> {
    this.isShuttingDown = true
    
    try {
      // Dispose all connection resources
      await this.resourceManager.disposeResourcesByType('tcp_connection')
      
      // Force close all active connections
      for (const [sessionId, socket] of this.activeConnections) {
        try {
          if (!socket.destroyed) {
            socket.destroy()
            this.logger.debug('TCP connection destroyed during disposal', { sessionId })
          }
        } catch (error) {
          this.errorHandler.handleError(error as Error, {
            sessionId,
            component: 'tcp_server',
            operation: 'dispose_connection',
            protocol: 'tcp'
          })
        }
      }
      
      this.activeConnections.clear()
      
      // Clear all timeouts
      for (const timeout of this.connectionTimeouts.values()) {
        clearTimeout(timeout)
      }
      this.connectionTimeouts.clear()
      
      // Dispose all resources
      await this.resourceManager.disposeAllResources()
      
      this.logger.info('TCP Server disposed successfully')
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        component: 'tcp_server',
        operation: 'dispose',
        protocol: 'tcp'
      })
    }
  }

  getActiveConnectionsCount(): number {
    return this.activeConnections.size
  }

  getPort(): number {
    return this.port
  }
}
