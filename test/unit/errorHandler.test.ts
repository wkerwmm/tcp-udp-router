import { expect } from 'chai'
import { ErrorHandler, RouterError, ErrorType, ErrorSeverity, createErrorHandler } from '../../src/core/errorHandler'
import { createLogger } from '../../src/logger'

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler
  let logger: any

  beforeEach(() => {
    logger = createLogger('error')
    errorHandler = createErrorHandler(logger)
  })

  describe('RouterError', () => {
    it('should create a RouterError with correct properties', () => {
      const error = new RouterError(
        'Test error',
        ErrorType.CONNECTION_ERROR,
        ErrorSeverity.HIGH,
        { sessionId: 'test-session' },
        true
      )

      expect(error.message).to.equal('Test error')
      expect(error.type).to.equal(ErrorType.CONNECTION_ERROR)
      expect(error.severity).to.equal(ErrorSeverity.HIGH)
      expect(error.context.sessionId).to.equal('test-session')
      expect(error.retryable).to.be.true
      expect(error.timestamp).to.be.instanceOf(Date)
    })

    it('should serialize to JSON correctly', () => {
      const originalError = new Error('Original error')
      const error = new RouterError(
        'Test error',
        ErrorType.NETWORK_ERROR,
        ErrorSeverity.MEDIUM,
        { component: 'test' },
        false,
        originalError
      )

      const json = error.toJSON()
      expect(json.name).to.equal('RouterError')
      expect(json.message).to.equal('Test error')
      expect(json.type).to.equal(ErrorType.NETWORK_ERROR)
      expect(json.severity).to.equal(ErrorSeverity.MEDIUM)
      expect(json.context.component).to.equal('test')
      expect(json.retryable).to.be.false
      expect(json.originalError).to.exist
    })
  })

  describe('Error handling', () => {
    it('should handle RouterError correctly', () => {
      const error = new RouterError(
        'Test error',
        ErrorType.CONNECTION_ERROR,
        ErrorSeverity.HIGH,
        { sessionId: 'test-session' }
      )

      expect(() => errorHandler.handleError(error)).to.not.throw()
    })

    it('should wrap regular Error correctly', () => {
      const error = new Error('Regular error')
      const context = { sessionId: 'test-session' }

      expect(() => errorHandler.handleError(error, context)).to.not.throw()
    })
  })

  describe('Retry logic', () => {
    it('should retry retryable operations', async () => {
      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('Temporary error')
        }
        return 'success'
      }

      const result = await errorHandler.executeWithRetry(operation, { sessionId: 'test' })
      expect(result).to.equal('success')
      expect(attemptCount).to.equal(3)
    })

    it('should not retry non-retryable operations', async () => {
      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        throw new Error('Permanent error')
      }

      try {
        await errorHandler.executeWithRetry(operation, { sessionId: 'test' })
        expect.fail('Should have thrown error')
      } catch (error) {
        expect(attemptCount).to.equal(1)
      }
    })

    it('should respect max retries', async () => {
      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        throw new Error('Always fails')
      }

      try {
        await errorHandler.executeWithRetry(operation, { sessionId: 'test' }, { maxRetries: 2 })
        expect.fail('Should have thrown error')
      } catch (error) {
        expect(attemptCount).to.equal(3) // 1 initial + 2 retries
      }
    })
  })

  describe('Error statistics', () => {
    it('should track error statistics', () => {
      const error1 = new RouterError('Error 1', ErrorType.CONNECTION_ERROR, ErrorSeverity.HIGH)
      const error2 = new RouterError('Error 2', ErrorType.CONNECTION_ERROR, ErrorSeverity.MEDIUM)
      const error3 = new RouterError('Error 3', ErrorType.NETWORK_ERROR, ErrorSeverity.LOW)

      errorHandler.handleError(error1)
      errorHandler.handleError(error2)
      errorHandler.handleError(error3)

      const stats = errorHandler.getErrorStats()
      expect(stats[ErrorType.CONNECTION_ERROR].count).to.equal(2)
      expect(stats[ErrorType.NETWORK_ERROR].count).to.equal(1)
    })

    it('should reset error statistics', () => {
      const error = new RouterError('Test error', ErrorType.CONNECTION_ERROR, ErrorSeverity.HIGH)
      errorHandler.handleError(error)

      let stats = errorHandler.getErrorStats()
      expect(stats[ErrorType.CONNECTION_ERROR].count).to.equal(1)

      errorHandler.resetErrorStats()
      stats = errorHandler.getErrorStats()
      expect(stats).to.be.empty
    })
  })
})