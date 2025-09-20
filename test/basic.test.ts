import { expect } from 'chai'
import { createContainer } from '../src/container'
import { Router } from '../src/core/router'
import { SessionStore } from '../src/core/sessionStore'
import { createPipeline } from '../src/pipeline'
import { registerLogger } from '../src/logger'

describe('TCP/UDP Router Core Components', () => {
  describe('Container', () => {
    it('should register and resolve services', () => {
      const container = createContainer()
      const testService = { name: 'test' }

      container.register('testService', () => testService)
      const resolved = container.resolve('testService')

      expect(resolved).to.equal(testService)
    })

    it('should throw error for unknown services', () => {
      const container = createContainer()
      
      expect(() => container.resolve('unknown')).to.throw('Service not found: unknown')
    })
  })

  describe('Router', () => {
    it('should route based on rules', () => {
      const container = createContainer()
      registerLogger(container)
      const router = new Router(container)
      let handled = false

      router.addRoute(
        'testRoute',
        (ctx) => ctx.protocol === 'tcp',
        (ctx) => { handled = true }
      )

      router.route({ protocol: 'tcp' })
      expect(handled).to.be.true
    })
  })

  describe('SessionStore', () => {
    it('should create and manage sessions', () => {
      const container = createContainer()
      registerLogger(container)
      const store = new SessionStore(container)
      const mockSocket = { remoteAddress: '127.0.0.1', remotePort: 8080 }

      const sessionId = store.createSession(mockSocket as any)
      const session = store.getSession(sessionId)

      expect(session).to.exist
      expect(session?.protocol).to.equal('tcp')
      expect(store.removeSession(sessionId)).to.be.true
    })
  })

  describe('Pipeline', () => {
    it('should process middleware in order', async () => {
      const pipeline = createPipeline()
      const calls: number[] = []

      pipeline.use(async (ctx, next) => {
        calls.push(1)
        await next()
      })

      pipeline.use(async (ctx, next) => {
        calls.push(2)
        await next()
      })

      await pipeline.process({})
      expect(calls).to.deep.equal([1, 2])
    })
  })
})
