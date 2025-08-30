import { Server, Socket } from 'net'
import { Container, Disposable } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export class TCPServer implements Disposable {
  private server: Server
  private port: number
  private container: Container
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private activeConnections: Map<string, Socket>

  constructor(port: number, container: Container) {
    this.port = port
    this.container = container
    this.server = new Server()
    this.logger = container.resolve<StructuredLogger>('logger')
    this.activeConnections = new Map()
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }
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
        this.logger.error('TCP Server error', { error: err.message })
        reject(err)
      })
    })
  }

  private handleConnection(socket: Socket) {
    const sessionStore = this.container.resolve<any>('sessionStore')
    const router = this.container.resolve<any>('router')
    const pipeline = this.container.resolve<any>('pipeline')

    const sessionId = sessionStore.createSession(socket)
    this.activeConnections.set(sessionId, socket)
    
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

        await pipeline.process(context)
        
        const processingTime = Date.now() - startTime
        this.metrics?.recordProcessingTime('tcp', processingTime / 1000)
        this.metrics?.recordMessageSize('tcp', data.length)
        this.metrics?.incrementMessagesProcessed('tcp', 'success')
        
      } catch (error) {
        const processingTime = Date.now() - startTime
        this.metrics?.recordProcessingTime('tcp', processingTime / 1000)
        this.metrics?.incrementMessagesProcessed('tcp', 'error')
        this.metrics?.incrementError('processing_error', 'tcp_server')
        
        this.logger.error('TCP message processing error', { 
          sessionId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    socket.on('close', () => {
      sessionStore.removeSession(sessionId)
      this.activeConnections.delete(sessionId)
      
      this.logger.info('TCP connection closed', { sessionId })
      this.metrics?.decrementTcpConnections('active')
    })

    socket.on('error', (err) => {
      this.logger.error('TCP connection error', { 
        sessionId, 
        error: err.message 
      })
      this.metrics?.incrementError('connection_error', 'tcp_server')
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('TCP Server stopped')
        resolve()
      })
    })
  }

  async dispose(): Promise<void> {
    await this.stop()
    
    for (const [sessionId, socket] of this.activeConnections) {
      try {
        socket.destroy()
        this.logger.info('TCP connection destroyed during disposal', { sessionId })
      } catch (error) {
        this.logger.error('Error destroying TCP connection', { 
          sessionId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    this.activeConnections.clear()
  }

  getActiveConnectionsCount(): number {
    return this.activeConnections.size
  }

  getPort(): number {
    return this.port
  }
}
