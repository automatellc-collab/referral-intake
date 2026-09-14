import { describe, it, expect } from 'vitest'
import { candleSchema, quoteSchema } from '../market-data-schemas'

describe('Market Data Validation Schemas', () => {
  describe('candleSchema', () => {
    it('accepts valid candle', () => {
      const candle = {
        timestamp: Date.now(),
        open: 550.0,
        high: 551.5,
        low: 549.5,
        close: 551.0,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).not.toThrow()
    })

    it('rejects candle with high < low', () => {
      const candle = {
        timestamp: Date.now(),
        open: 550.0,
        high: 549.0,
        low: 550.5,
        close: 551.0,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })

    it('rejects candle with high < open', () => {
      const candle = {
        timestamp: Date.now(),
        open: 551.0,
        high: 550.5,
        low: 549.5,
        close: 550.0,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })

    it('rejects candle with high < close', () => {
      const candle = {
        timestamp: Date.now(),
        open: 550.0,
        high: 550.5,
        low: 549.5,
        close: 551.0,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })

    it('rejects candle with low > open', () => {
      const candle = {
        timestamp: Date.now(),
        open: 550.0,
        high: 551.5,
        low: 550.5,
        close: 551.0,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })

    it('rejects candle with low > close', () => {
      const candle = {
        timestamp: Date.now(),
        open: 550.0,
        high: 551.5,
        low: 551.0,
        close: 550.5,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })

    it('rejects negative volume', () => {
      const candle = {
        timestamp: Date.now(),
        open: 550.0,
        high: 551.5,
        low: 549.5,
        close: 551.0,
        volume: -100,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })

    it('accepts zero volume', () => {
      const candle = {
        timestamp: Date.now(),
        open: 550.0,
        high: 551.5,
        low: 549.5,
        close: 551.0,
        volume: 0,
      }
      expect(() => candleSchema.parse(candle)).not.toThrow()
    })

    it('rejects negative prices', () => {
      const candle = {
        timestamp: Date.now(),
        open: -550.0,
        high: 551.5,
        low: 549.5,
        close: 551.0,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })

    it('rejects zero prices', () => {
      const candle = {
        timestamp: Date.now(),
        open: 0,
        high: 551.5,
        low: 549.5,
        close: 551.0,
        volume: 1000,
      }
      expect(() => candleSchema.parse(candle)).toThrow()
    })
  })

  describe('quoteSchema', () => {
    it('accepts valid quote', () => {
      const quote = {
        symbol: 'SPY',
        bid: 550.5,
        ask: 550.6,
        lastPrice: 550.55,
        volume: 5000,
        timestamp: Date.now(),
      }
      expect(() => quoteSchema.parse(quote)).not.toThrow()
    })

    it('rejects quote with bid >= ask', () => {
      const quote = {
        symbol: 'SPY',
        bid: 550.6,
        ask: 550.5,
        lastPrice: 550.55,
        volume: 5000,
        timestamp: Date.now(),
      }
      expect(() => quoteSchema.parse(quote)).toThrow()
    })

    it('rejects quote with bid == ask', () => {
      const quote = {
        symbol: 'SPY',
        bid: 550.5,
        ask: 550.5,
        lastPrice: 550.55,
        volume: 5000,
        timestamp: Date.now(),
      }
      expect(() => quoteSchema.parse(quote)).toThrow()
    })

    it('rejects negative volume', () => {
      const quote = {
        symbol: 'SPY',
        bid: 550.5,
        ask: 550.6,
        lastPrice: 550.55,
        volume: -100,
        timestamp: Date.now(),
      }
      expect(() => quoteSchema.parse(quote)).toThrow()
    })

    it('accepts zero volume', () => {
      const quote = {
        symbol: 'SPY',
        bid: 550.5,
        ask: 550.6,
        lastPrice: 550.55,
        volume: 0,
        timestamp: Date.now(),
      }
      expect(() => quoteSchema.parse(quote)).not.toThrow()
    })

    it('rejects invalid symbol', () => {
      const quote = {
        symbol: 'INVALID',
        bid: 550.5,
        ask: 550.6,
        lastPrice: 550.55,
        volume: 5000,
        timestamp: Date.now(),
      }
      expect(() => quoteSchema.parse(quote)).toThrow()
    })

    it('rejects negative prices', () => {
      const quote = {
        symbol: 'SPY',
        bid: -550.5,
        ask: 550.6,
        lastPrice: 550.55,
        volume: 5000,
        timestamp: Date.now(),
      }
      expect(() => quoteSchema.parse(quote)).toThrow()
    })
  })
})
