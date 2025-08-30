import { Container } from '../container'
import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export interface Connection {
  id: string
  protocol: 'tcp' | 'udp'
  remoteAddress: string
  remotePort: number
  createdAt: Date
  lastActivity: Date
  metadata: Record<string, any>
  bytesSent: number
  bytesReceived: number
  messagesProcessed: number
}

export function createConnection(
  id: string,
  protocol: 'tcp' | 'udp',
  remoteAddress: string,
  remotePort: number
): Connection {
  const now = new Date()
  return {
    id,
    protocol,
    remoteAddress,
    remotePort,
    createdAt: now,
    lastActivity: now,
    metadata: {},
    bytesSent: 0,
    bytesReceived: 0,
    messagesProcessed: 0
  }
}

export function updateConnectionActivity(connection: Connection): Connection {
  return {
    ...connection,
    lastActivity: new Date()
  }
}

export function addConnectionMetadata(
  connection: Connection,
  key: string,
  value: any
): Connection {
  return {
    ...connection,
    metadata: {
      ...connection.metadata,
      [key]: value
    }
  }
}

export function updateConnectionStats(
  connection: Connection,
  bytesSent: number = 0,
  bytesReceived: number = 0,
  messagesProcessed: number = 0
): Connection {
  return {
    ...connection,
    bytesSent: connection.bytesSent + bytesSent,
    bytesReceived: connection.bytesReceived + bytesReceived,
    messagesProcessed: connection.messagesProcessed + messagesProcessed,
    lastActivity: new Date()
  }
}

export function getConnectionAge(connection: Connection): number {
  return Date.now() - connection.createdAt.getTime()
}

export function getConnectionIdleTime(connection: Connection): number {
  return Date.now() - connection.lastActivity.getTime()
}

export function createConnectionManager(container: Container) {
  const logger = container.resolve<StructuredLogger>('logger')
  const metrics = container.has('metrics') ? container.resolve<MetricsCollector>('metrics') : undefined

  return {
    createConnection,
    updateConnectionActivity,
    addConnectionMetadata,
    updateConnectionStats,
    getConnectionAge,
    getConnectionIdleTime,
    
    logConnectionCreated(connection: Connection): void {
      logger.info('Connection created', {
        sessionId: connection.id,
        protocol: connection.protocol,
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort
      })
    },
    
    logConnectionActivity(connection: Connection, bytes: number, direction: 'sent' | 'received'): void {
      logger.debug('Connection activity', {
        sessionId: connection.id,
        protocol: connection.protocol,
        bytes,
        direction
      })
      
      if (metrics) {
        if (direction === 'sent') {
          metrics.recordMessageSize(connection.protocol, bytes)
        }
      }
    },
    
    logConnectionClosed(connection: Connection): void {
      logger.info('Connection closed', {
        sessionId: connection.id,
        protocol: connection.protocol,
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort,
        bytesSent: connection.bytesSent,
        bytesReceived: connection.bytesReceived,
        messagesProcessed: connection.messagesProcessed,
        duration: getConnectionAge(connection)
      })
    }
  }
}
