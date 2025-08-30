import { createSocket, Socket } from 'dgram'
import { Container, Disposable } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export class UDPServer implements Disposable {
  private server: Socket
  private port: number
  private container: Container
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private activeSessions: Map<string, number>

  constructor(port: number, container: Container) {
    this.port = port
    this.container = container
    this.server = createSocket('udp4')
    this.logger = container.resolve<StructuredLogger>('logger')
    this.activeSessions = new Map()
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }
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
        this.logger.error('UDP Server error', { error: err.message })
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
    })
  }

  private handleMessage(msg: Buffer, rinfo: any) {
    const sessionStore = this.container.resolve<any>('sessionStore')
    const router = this.container.resolve<any>('router')
    const pipeline = this.container.resolve<any>('pipeline')

    const sessionId = sessionStore.getOrCreateUdpSession(rinfo)
    const sessionKey = `${rinfo.address}:${rinfo.port}`
    
    if (!this.activeSessions.has(sessionKey)) {
      this.activeSessions.set(sessionKey, 1)
      this.metrics?.incrementUdpConnections('active')
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

      pipeline.process(context)
      
      const processingTime = Date.now() - startTime
      this.metrics?.recordProcessingTime('udp', processingTime / 1000)
      this.metrics?.recordMessageSize('udp', msg.length)
      this.metrics?.incrementMessagesProcessed('udp', 'success')
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      this.metrics?.recordProcessingTime('udp', processingTime / 1000)
      this.metrics?.incrementMessagesProcessed('udp', 'error')
      this.metrics?.incrementError('processing_error', 'udp_server')
      
      this.logger.error('UDP message processing error', { 
        sessionId, 
        remoteAddress: rinfo.address,
        remotePort: rinfo.port,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('UDP Server stopped')
        resolve()
      })
    })
  }

  async dispose(): Promise<void> {
    await this.stop()
    this.activeSessions.clear()
    this.logger.info('UDP Server disposed')
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
