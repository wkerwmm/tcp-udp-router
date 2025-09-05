//sorunlu calisiyor 

import { Plugin } from '../src/plugins/pluginManager'
import { Container } from '../src/container'
import { StructuredLogger } from '../src/logger'
import { loadConfig } from '../src/config'
import mc from 'minecraft-protocol'

let logger: StructuredLogger
let server: mc.Server

type Ctx = { packetName: string; direction: string; sessionId: string }

function safeWrite(target: any, packetName: string, data: any, ctx: Ctx) {
  try {
    if (data === undefined) data = { text: 'Proxy fallback packet' }
    if (data instanceof Error) data = { text: data.message || 'Proxy fallback packet' }

    if (packetName === 'disconnect' || packetName === 'kick_disconnect') {
      if (typeof data !== 'object' || !('text' in data)) {
        data = { reason: { text: 'Disconnected by proxy' } }
      }
    }

    target.write(packetName, data)
  } catch (err) {
    logger.error('safeWrite failed', { ...ctx, error: (err as Error).message, stack: (err as Error).stack })
  }
}

function handlePacketError(error: Error, packetName: string, direction: string, sessionId: string) {
  if (error.message.includes('ECONNRESET') || error.message.includes('ECONNREFUSED')) {
    logger.warn(`Connection ${direction} error for ${packetName}`, { sessionId, error: error.message, code: (error as any).code })
  } else {
    logger.error(`Packet ${direction} error for ${packetName}`, { sessionId, error: error.message, stack: error.stack })
  }
}

class ConnectionManager {
  private clientConnections = new Map<string, boolean>()
  private targetConnections = new Map<string, boolean>()
  private connectionTimeouts = new Map<string, NodeJS.Timeout>()

  isClientConnected(sessionId: string) { return this.clientConnections.get(sessionId) || false }
  isTargetConnected(sessionId: string) { return this.targetConnections.get(sessionId) || false }
  setClientConnected(sessionId: string, connected: boolean) { this.clientConnections.set(sessionId, connected) }
  setTargetConnected(sessionId: string, connected: boolean) { this.targetConnections.set(sessionId, connected) }
  setTimeout(sessionId: string, timeout: NodeJS.Timeout) { this.clearTimeout(sessionId); this.connectionTimeouts.set(sessionId, timeout) }
  clearTimeout(sessionId: string) { const t = this.connectionTimeouts.get(sessionId); if (t) { clearTimeout(t); this.connectionTimeouts.delete(sessionId) } }
  removeConnection(sessionId: string) { this.clearTimeout(sessionId); this.clientConnections.delete(sessionId); this.targetConnections.delete(sessionId) }
}

const connectionManager = new ConnectionManager()

const minecraftPlugin: Plugin = {
  name: 'minecraftPlugin',
  version: '2.6.0',
  description: 'Full safe Minecraft MITM proxy with advanced packet handling',

  initialize(container: Container) {
    logger = container.resolve<StructuredLogger>('logger')
    logger.info('Minecraft plugin initialized with Velocity support', {})
  },

  async onStart() {
    const config = loadConfig()
    server = mc.createServer({
      'online-mode': false,
      host: '0.0.0.0',
      port: 25565,
      version: '1.21.4',
      maxPlayers: 20,
      motd: 'Minecraft Proxy Server',
      keepAlive: true,
      checkTimeoutInterval: 30000,
    })

    server.on('login', (client) => {
      const sessionId = `${client.socket.remoteAddress}:${client.socket.remotePort}`
      logger.info(`Yeni client bağlandı: ${sessionId}, version: ${client.version}`, { username: client.username })
      connectionManager.setClientConnected(sessionId, true)

      const targetClient = mc.createClient({
        host: config.MINECRAFT_TARGET_IP,
        port: parseInt(config.MINECRAFT_TARGET_PORT) || 25566,
        username: client.username,
        version: client.version,
        auth: 'offline',
        keepAlive: true,
        closeTimeout: 30000,
      })

      let successSent = false
      let configurationPhase = true
      let loginAckPacket: { data: any; meta: any } | null = null
      let packetBuffer: { data: any; meta: any }[] = []

      const flushBufferedPackets = () => {
        for (const packet of packetBuffer) {
          try { targetClient.write(packet.meta.name, packet.data) } 
          catch (err) { handlePacketError(err as Error, packet.meta.name, 'buffered->target', sessionId) }
        }
        packetBuffer = []
      }

      targetClient.on('connect', () => {
        connectionManager.setTargetConnected(sessionId, true)
        logger.info('Target server connected', { sessionId })
        if (successSent) flushBufferedPackets()
      })

      client.on('packet', (data, meta) => {
        if (!connectionManager.isClientConnected(sessionId)) return
        if (meta.name === 'login_acknowledged') {
          loginAckPacket = { data, meta }
          if (successSent && connectionManager.isTargetConnected(sessionId)) {
            try { targetClient.write(meta.name, data); loginAckPacket = null } 
            catch (err) { handlePacketError(err as Error, meta.name, 'login_ack->target', sessionId) }
          }
          return
        }
        if (connectionManager.isTargetConnected(sessionId) && successSent) {
          try { targetClient.write(meta.name, data) } 
          catch (err) { handlePacketError(err as Error, meta.name, 'client->target', sessionId) }
        } else { packetBuffer.push({ data, meta }) }
      })

      targetClient.on('packet', (data, meta) => {
        if (!connectionManager.isClientConnected(sessionId)) return
        try {
          if (meta.name === 'set_compression' || meta.name === 'login_compression') {
            client.write(meta.name, data)
            return
          }
          if (configurationPhase && meta.name === 'disconnect') {
            setTimeout(() => {
              if (connectionManager.isClientConnected(sessionId)) { try { client.end() } catch {} try { targetClient.end() } catch {} }
            }, 1000)
            return
          }
          safeWrite(client, meta.name, data, { packetName: meta.name, direction: 'server->client', sessionId })
          if (meta.name === 'success') {
            successSent = true
            configurationPhase = false
            if (loginAckPacket) {
              try { targetClient.write(loginAckPacket.meta.name, loginAckPacket.data); loginAckPacket = null } 
              catch (err) { handlePacketError(err as Error, loginAckPacket.meta.name, 'buffered_ack->target', sessionId) }
            }
            flushBufferedPackets()
          }
          if (meta.name === 'finish_configuration' || meta.name === 'end_configuration') configurationPhase = false
        } catch (err) { handlePacketError(err as Error, meta.name, 'server->client', sessionId) }
      })

      client.on('error', (error) => {
        logger.error('Client connection error', { sessionId, error: error.message, code: (error as any).code })
        connectionManager.setClientConnected(sessionId, false)
        try { targetClient.end() } catch {}
      })

      targetClient.on('error', (error) => {
        logger.error('Target connection error', { sessionId, error: error.message, code: (error as any).code })
        connectionManager.setTargetConnected(sessionId, false)
        try { client.end() } catch {}
      })

      client.on('end', () => {
        logger.info('Client disconnected', { sessionId })
        connectionManager.setClientConnected(sessionId, false)
        try { targetClient.end() } catch {}
        connectionManager.removeConnection(sessionId)
      })

      targetClient.on('end', () => {
        logger.info('Target server disconnected', { sessionId })
        connectionManager.setTargetConnected(sessionId, false)
        try { client.end() } catch {}
        connectionManager.removeConnection(sessionId)
      })

      const timeout = setTimeout(() => {
        if (!successSent) {
          logger.warn('Connection timeout, closing stale connection', { sessionId })
          try { client.end() } catch {}
          try { targetClient.end() } catch {}
          connectionManager.removeConnection(sessionId)
        }
      }, 60000)
      connectionManager.setTimeout(sessionId, timeout)
    })

    server.on('error', (error) => { logger.error('Minecraft proxy server error', { error: error.message }) })
    server.on('listening', () => { const cfg = loadConfig(); logger.info('Minecraft proxy server started with Velocity support', { host: '0.0.0.0', port: 25565, target: `${cfg.MINECRAFT_TARGET_IP}:${cfg.MINECRAFT_TARGET_PORT}` }) })
  },

  async onStop() {
    if (server) {
      server.close()
      logger?.info('Minecraft proxy server stopped', {})
    }
  },

  async dispose() { await this.onStop() },
}

export default minecraftPlugin
