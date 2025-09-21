import { Socket } from 'net'
import { Container, Disposable } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'
import { Connection, createConnection, updateConnectionActivity, addConnectionMetadata } from './connection'
import * as crypto from 'crypto'
export class SessionStore implements Disposable {
  private sessions: Map<string, Connection>
  private udpSessions: Map<string, Connection>
  private logger: StructuredLogger
  private metrics?: MetricsCollector

  constructor(container: Container) {
    this.sessions = new Map()
    this.udpSessions = new Map()
    this.logger = container.resolve<StructuredLogger>('logger')
    
    if (container.has('metrics')) {
      this.metrics = container.resolve<MetricsCollector>('metrics')
    }
  }

  createSession(socket: Socket): string {
    const id = this.generateSessionId()
    const connection = createConnection(
      id,
      'tcp',
      socket.remoteAddress || 'unknown',
      socket.remotePort || 0
    )
    this.sessions.set(id, connection)
    
    this.logger.debug('TCP session created', { 
      sessionId: id, 
      remoteAddress: connection.remoteAddress,
      remotePort: connection.remotePort
    })
    
    this.metrics?.incrementTcpConnections('active')
    return id
  }

  getOrCreateUdpSession(rinfo: any): string {
    const key = `${rinfo.address}:${rinfo.port}`
    let connection = this.udpSessions.get(key)

    if (!connection) {
      const id = this.generateSessionId()
      connection = createConnection(id, 'udp', rinfo.address, rinfo.port)
      this.udpSessions.set(key, connection)
      
      this.logger.debug('UDP session created', { 
        sessionId: id, 
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort
      })
      
      this.metrics?.incrementUdpConnections('active')
    } else {
      connection = updateConnectionActivity(connection)
      this.udpSessions.set(key, connection)
      
      this.logger.debug('UDP session updated', { 
        sessionId: connection.id, 
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort
      })
    }

    return connection.id
  }

  getSession(sessionId: string): Connection | undefined {
    return this.sessions.get(sessionId)
  }

  getUdpSessionByAddress(address: string, port: number): Connection | undefined {
    const key = `${address}:${port}`
    return this.udpSessions.get(key)
  }

  removeSession(sessionId: string): boolean {
    const connection = this.sessions.get(sessionId)
    if (connection) {
      this.sessions.delete(sessionId)
      
      this.logger.debug('TCP session removed', { 
        sessionId, 
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort
      })
      
      this.metrics?.decrementTcpConnections('active')
      return true
    }
    return false
  }

  removeUdpSession(address: string, port: number): boolean {
    const key = `${address}:${port}`
    const connection = this.udpSessions.get(key)
    if (connection) {
      this.udpSessions.delete(key)
      
      this.logger.debug('UDP session removed', { 
        sessionId: connection.id, 
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort
      })
      
      this.metrics?.decrementUdpConnections('active')
      return true
    }
    return false
  }

  getAllSessions(): Connection[] {
    return Array.from(this.sessions.values())
  }

  getAllUdpSessions(): Connection[] {
    return Array.from(this.udpSessions.values())
  }

  getSessionCount(): { tcp: number; udp: number } {
    return {
      tcp: this.sessions.size,
      udp: this.udpSessions.size
    }
  }

  updateSessionMetadata(sessionId: string, key: string, value: any): boolean {
    const connection = this.sessions.get(sessionId)
    if (connection) {
      const updated = addConnectionMetadata(connection, key, value)
      this.sessions.set(sessionId, updated)
      return true
    }
    return false
  }

  updateUdpSessionMetadata(address: string, port: number, key: string, value: any): boolean {
    const keyStr = `${address}:${port}`
    const connection = this.udpSessions.get(keyStr)
    if (connection) {
      const updated = addConnectionMetadata(connection, key, value)
      this.udpSessions.set(keyStr, updated)
      return true
    }
    return false
  }

  async dispose(): Promise<void> {
    const tcpCount = this.sessions.size
    const udpCount = this.udpSessions.size
    
    this.sessions.clear()
    this.udpSessions.clear()
    
    this.logger.info('Session store disposed', { 
      tcpSessionsCleared: tcpCount,
      udpSessionsCleared: udpCount
    })
  }

  private generateSessionId(): string {
    // 16 bytes = 128 bits of entropy, encoded as hex is 32 characters, which is reasonable for a session ID
    return crypto.randomBytes(16).toString('hex') + Date.now().toString(36)
  }
}
