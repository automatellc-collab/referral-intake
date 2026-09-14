import { describe, it, expect } from 'vitest'
import {
  AppError,
  DataUnavailableError,
  ValidationError,
  InsufficientCapitalError,
  RiskLimitExceededError,
  DuplicateTradeError,
  StrategyBlockedError,
  classifyError,
  toApiResponse,
} from '../error-handler'

describe('Error Handler', () => {
  describe('Error Classes', () => {
    it('creates DataUnavailableError', () => {
      const error = new DataUnavailableError('Yahoo Finance API timeout')
      expect(error).toBeInstanceOf(DataUnavailableError)
      expect(error.message).toBe('Yahoo Finance API timeout')
      expect(error.statusCode).toBe(502)
    })

    it('creates ValidationError', () => {
      const error = new ValidationError('Invalid symbol: FAKE')
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.statusCode).toBe(400)
    })

    it('creates InsufficientCapitalError', () => {
      const error = new InsufficientCapitalError(100, 50)
      expect(error).toBeInstanceOf(InsufficientCapitalError)
      expect(error.statusCode).toBe(403)
    })

    it('creates RiskLimitExceededError', () => {
      const error = new RiskLimitExceededError(2.5, 2.0)
      expect(error).toBeInstanceOf(RiskLimitExceededError)
      expect(error.statusCode).toBe(403)
    })

    it('creates DuplicateTradeError', () => {
      const error = new DuplicateTradeError('SPY')
      expect(error).toBeInstanceOf(DuplicateTradeError)
      expect(error.statusCode).toBe(409)
    })

    it('creates StrategyBlockedError', () => {
      const error = new StrategyBlockedError('ORB not yet formed')
      expect(error).toBeInstanceOf(StrategyBlockedError)
      expect(error.statusCode).toBe(202)
    })
  })

  describe('classifyError', () => {
    it('classifies ZodError as ValidationError', async () => {
      const { z } = await import('zod')
      const schema = z.object({ value: z.number() })
      try {
        schema.parse({ value: 'not a number' })
      } catch (e) {
        const classified = classifyError(e)
        expect(classified).toBeInstanceOf(ValidationError)
      }
    })

    it('classifies known AppError types', () => {
      const error = new DataUnavailableError('test')
      const classified = classifyError(error)
      expect(classified).toBe(error)
    })

    it('classifies unknown Error as AppError', () => {
      const error = new Error('Something went wrong')
      const classified = classifyError(error)
      expect(classified).toBeInstanceOf(AppError)
      expect(classified.statusCode).toBe(500)
    })
  })

  describe('toApiResponse', () => {
    it('converts AppError to API response', () => {
      const error = new ValidationError('Bad input')
      const response = toApiResponse(error)
      expect(response).toEqual({
        success: false,
        data: null,
        error: 'Bad input',
      })
    })

    it('masks internal errors', () => {
      const error = new AppError('Internal database error', 500)
      const response = toApiResponse(error)
      expect(response.error).toBe('Internal error')
      expect(response.error).not.toContain('database')
    })

    it('includes context for field validation errors', () => {
      const error = new ValidationError('Invalid field: symbol')
      const response = toApiResponse(error)
      expect(response.success).toBe(false)
      expect(response.error).toBe('Invalid field: symbol')
    })
  })
})
