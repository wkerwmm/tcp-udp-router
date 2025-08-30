import { expect } from 'chai'
import { createContainer } from '../src/container'
import { Router } from '../src/core/router'
import { SessionStore } from '../src/core/sessionStore'
import { createPipeline } from '../src/pipeline'

describe('TCP/UDP Router Core Components', () => {
  describe('Container', () => {
    it('should register and resolve services', () => {
      const container = createContainer()
      const testService = { name: 'test' }
      
      container.register('testService', testService)
      const resolved = container.resolve('testService')
      
      expect(resolved).to.equal(testService)
    })

    it('should throw error for unknown service', () => {
      const container = createContainer()
      
      expect(() => container.resolve('unknown')).to.throw('Service not found: unknown')
    })
  })

  describe('Router', () => {
    it('should route based on rules', () => {
      const router = new Router()
      let handled = false
      
      router.addRoute(
        (ctx) => ctx.protocol === 'tcp',
        (ctx) => { handled = true }
      )
      
      router.route({ protocol: 'tcp' })
      expect(handled).to.be.true
    })
  })

  describe('SessionStore', () => {
    it('should create and manage sessions', () => {
      const store = new SessionStore()
      const mockSocket = { remoteAddress: '127.0.0.1', remotePort: 8080 }
      
      const sessionId = store.createSession(mockSocket as any)
      const session = store.getSession(sessionId)
      
      expect(session).to.exist
      expect(session?.protocol).to.equal('tcp')
      expect(store.removeSession(sessionId)).to.be.true
    })
  })

  describe('Pipeline', () => {
    it('should process middleware in order', () => {
      const pipeline = createPipeline()
      const calls: number[] = []
      
      pipeline.use((ctx, next) => {
        calls.push(1)
        next()
      })
      
      pipeline.use((ctx, next) => {
        calls.push(2)
        next()
      })
      
      pipeline.process({})
      expect(calls).to.deep.equal([1, 2])
    })
  })
})
