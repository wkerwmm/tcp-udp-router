import { expect } from 'chai'
import { SecurityManager, createSecurityManager } from '../../src/security/securityManager'
import { createLogger } from '../../src/logger'

describe('SecurityManager', () => {
  let securityManager: SecurityManager
  let logger: any

  beforeEach(() => {
    logger = createLogger('error')
    securityManager = createSecurityManager(logger, undefined, undefined, {
      enableIPFiltering: true,
      enableRateLimiting: true,
      enableHealthCheckAuth: true,
      healthCheckSecret: 'test-secret',
      maxConnectionsPerIP: 5,
      defaultRateLimit: {
        windowMs: 60000,
        maxRequests: 10
      }
    })
  })

  describe('IP Access Control', () => {
    it('should allow access when IP filtering is disabled', async () => {
      const manager = createSecurityManager(logger, undefined, undefined, {
        enableIPFiltering: false
      })

      const result = await manager.checkIPAccess('192.168.1.1')
      expect(result).to.be.true
    })

    it('should allow access for whitelisted IPs', async () => {
      securityManager.addIPRule({
        address: '192.168.1.1',
        type: 'whitelist',
        description: 'Test IP'
      })

      const result = await securityManager.checkIPAccess('192.168.1.1')
      expect(result).to.be.true
    })

    it('should block access for blacklisted IPs', async () => {
      securityManager.addIPRule({
        address: '192.168.1.100',
        type: 'blacklist',
        description: 'Blocked IP'
      })

      const result = await securityManager.checkIPAccess('192.168.1.100')
      expect(result).to.be.false
    })

    it('should block access when whitelist exists and IP is not in it', async () => {
      securityManager.addIPRule({
        address: '192.168.1.1',
        type: 'whitelist',
        description: 'Test IP'
      })

      const result = await securityManager.checkIPAccess('192.168.1.2')
      expect(result).to.be.false
    })
  })

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const result1 = await securityManager.checkRateLimit('192.168.1.1:tcp', 'tcp')
      const result2 = await securityManager.checkRateLimit('192.168.1.1:tcp', 'tcp')
      
      expect(result1).to.be.true
      expect(result2).to.be.true
    })

    it('should block requests when rate limit exceeded', async () => {
      // Send 11 requests (exceeding limit of 10)
      for (let i = 0; i < 11; i++) {
        await securityManager.checkRateLimit('192.168.1.1:tcp', 'tcp')
      }

      const result = await securityManager.checkRateLimit('192.168.1.1:tcp', 'tcp')
      expect(result).to.be.false
    })

    it('should reset rate limit after window expires', async () => {
      // Use a very short window for testing
      securityManager.setRateLimit('test-key', 2, 100) // 2 requests per 100ms

      // Exceed limit
      await securityManager.checkRateLimit('test-key', 'tcp')
      await securityManager.checkRateLimit('test-key', 'tcp')
      const blocked = await securityManager.checkRateLimit('test-key', 'tcp')
      expect(blocked).to.be.false

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should work again
      const allowed = await securityManager.checkRateLimit('test-key', 'tcp')
      expect(allowed).to.be.true
    })
  })

  describe('Connection Limits', () => {
    it('should allow connections within limit', async () => {
      const result = await securityManager.checkConnectionLimit('192.168.1.1')
      expect(result).to.be.true
    })

    it('should block connections when limit exceeded', async () => {
      // Exceed connection limit (5)
      for (let i = 0; i < 5; i++) {
        await securityManager.checkConnectionLimit('192.168.1.1')
      }

      const result = await securityManager.checkConnectionLimit('192.168.1.1')
      expect(result).to.be.false
    })

    it('should release connections correctly', () => {
      securityManager.checkConnectionLimit('192.168.1.1')
      securityManager.checkConnectionLimit('192.168.1.1')
      
      securityManager.releaseConnection('192.168.1.1')
      securityManager.releaseConnection('192.168.1.1')
      
      // Should be able to connect again
      return securityManager.checkConnectionLimit('192.168.1.1').then(result => {
        expect(result).to.be.true
      })
    })
  })

  describe('Health Check Authentication', () => {
    it('should validate correct health check token', () => {
      const result = securityManager.validateHealthCheckAuth('test-secret')
      expect(result).to.be.true
    })

    it('should reject incorrect health check token', () => {
      const result = securityManager.validateHealthCheckAuth('wrong-secret')
      expect(result).to.be.false
    })

    it('should reject undefined token when auth is enabled', () => {
      const result = securityManager.validateHealthCheckAuth(undefined)
      expect(result).to.be.false
    })
  })

  describe('IP Management', () => {
    it('should add and remove IP rules', () => {
      securityManager.addIPRule({
        address: '192.168.1.1',
        type: 'whitelist',
        description: 'Test IP'
      })

      const removed = securityManager.removeIPRule('192.168.1.1', 'whitelist')
      expect(removed).to.be.true

      const notFound = securityManager.removeIPRule('192.168.1.1', 'whitelist')
      expect(notFound).to.be.false
    })

    it('should block and unblock IPs', () => {
      securityManager.blockIP('192.168.1.100', 1000) // Block for 1 second
      
      return securityManager.checkIPAccess('192.168.1.100').then(result => {
        expect(result).to.be.false

        // Unblock manually
        securityManager.unblockIP('192.168.1.100')
        
        return securityManager.checkIPAccess('192.168.1.100').then(result => {
          expect(result).to.be.true
        })
      })
    })
  })

  describe('Statistics', () => {
    it('should provide security statistics', () => {
      const stats = securityManager.getSecurityStats()
      
      expect(stats).to.have.property('blockedIPs')
      expect(stats).to.have.property('activeConnections')
      expect(stats).to.have.property('rateLimitRules')
      expect(stats).to.have.property('ipRules')
    })
  })
})