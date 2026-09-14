import { describe, it, expect } from 'vitest'
import {
  entrySignalSchema,
  tradeSchema,
  tradingSettingsSchema,
  openingRangeSchema,
  orbSignalSchema,
} from '../trading-schemas'

describe('Trading Validation Schemas', () => {
  describe('entrySignalSchema', () => {
    it('accepts valid entry signal', () => {
      const signal = {
        type: 'RETEST' as const,
        symbol: 'SPY',
        direction: 'BULLISH' as const,
        price: 551.25,
        stopLoss: 550.0,
        takeProfit: 553.75,
        riskRewardRatio: 3,
        detectedAt: Date.now(),
      }
      expect(() => entrySignalSchema.parse(signal)).not.toThrow()
    })

    it('rejects price <= stopLoss for BULLISH', () => {
      const signal = {
        type: 'RETEST' as const,
        symbol: 'SPY',
        direction: 'BULLISH' as const,
        price: 550.0,
        stopLoss: 550.0,
        takeProfit: 553.75,
        riskRewardRatio: 3,
        detectedAt: Date.now(),
      }
      expect(() => entrySignalSchema.parse(signal)).toThrow()
    })

    it('rejects price >= stopLoss for BEARISH', () => {
      const signal = {
        type: 'RETEST' as const,
        symbol: 'SPY',
        direction: 'BEARISH' as const,
        price: 550.0,
        stopLoss: 550.0,
        takeProfit: 548.0,
        riskRewardRatio: 3,
        detectedAt: Date.now(),
      }
      expect(() => entrySignalSchema.parse(signal)).toThrow()
    })

    it('rejects negative price', () => {
      const signal = {
        type: 'RETEST' as const,
        symbol: 'SPY',
        direction: 'BULLISH' as const,
        price: -551.25,
        stopLoss: 550.0,
        takeProfit: 553.75,
        riskRewardRatio: 3,
        detectedAt: Date.now(),
      }
      expect(() => entrySignalSchema.parse(signal)).toThrow()
    })

    it('rejects riskRewardRatio < 1', () => {
      const signal = {
        type: 'RETEST' as const,
        symbol: 'SPY',
        direction: 'BULLISH' as const,
        price: 551.25,
        stopLoss: 550.0,
        takeProfit: 550.5,
        riskRewardRatio: 0.5,
        detectedAt: Date.now(),
      }
      expect(() => entrySignalSchema.parse(signal)).toThrow()
    })
  })

  describe('tradeSchema', () => {
    it('accepts valid trade', () => {
      const trade = {
        id: 'trade_123',
        userId: 'user_1',
        symbol: 'SPY',
        side: 'BUY' as const,
        entryPrice: 551.25,
        quantity: 10,
        stopLoss: 550.0,
        takeProfit: 553.75,
        mode: 'PAPER' as const,
        status: 'OPEN' as const,
        createdAt: new Date(),
      }
      expect(() => tradeSchema.parse(trade)).not.toThrow()
    })

    it('rejects quantity <= 0', () => {
      const trade = {
        id: 'trade_123',
        userId: 'user_1',
        symbol: 'SPY',
        side: 'BUY' as const,
        entryPrice: 551.25,
        quantity: 0,
        stopLoss: 550.0,
        takeProfit: 553.75,
        mode: 'PAPER' as const,
        status: 'OPEN' as const,
        createdAt: new Date(),
      }
      expect(() => tradeSchema.parse(trade)).toThrow()
    })

    it('rejects invalid symbol', () => {
      const trade = {
        id: 'trade_123',
        userId: 'user_1',
        symbol: 'INVALID',
        side: 'BUY' as const,
        entryPrice: 551.25,
        quantity: 10,
        stopLoss: 550.0,
        takeProfit: 553.75,
        mode: 'PAPER' as const,
        status: 'OPEN' as const,
        createdAt: new Date(),
      }
      expect(() => tradeSchema.parse(trade)).toThrow()
    })

    it('accepts optional exitPrice and exitTime', () => {
      const trade = {
        id: 'trade_123',
        userId: 'user_1',
        symbol: 'SPY',
        side: 'BUY' as const,
        entryPrice: 551.25,
        quantity: 10,
        stopLoss: 550.0,
        takeProfit: 553.75,
        exitPrice: 553.0,
        exitTime: new Date(),
        mode: 'PAPER' as const,
        status: 'CLOSED' as const,
        createdAt: new Date(),
      }
      expect(() => tradeSchema.parse(trade)).not.toThrow()
    })
  })

  describe('tradingSettingsSchema', () => {
    it('accepts valid settings', () => {
      const settings = {
        userId: 'user_1',
        mode: 'PAPER' as const,
        dailyLossLimitPct: 2.0,
        riskPerTradePct: 1.0,
        riskRewardRatio: 3,
        entryTypeFilter: 'ANY' as const,
        fibonacciAnchorMode: 'OPENING_RANGE' as const,
        maxOpenPositions: 3,
      }
      expect(() => tradingSettingsSchema.parse(settings)).not.toThrow()
    })

    it('rejects dailyLossLimitPct < 0.1', () => {
      const settings = {
        userId: 'user_1',
        mode: 'PAPER' as const,
        dailyLossLimitPct: 0.05,
        riskPerTradePct: 1.0,
        riskRewardRatio: 3,
        entryTypeFilter: 'ANY' as const,
        fibonacciAnchorMode: 'OPENING_RANGE' as const,
        maxOpenPositions: 3,
      }
      expect(() => tradingSettingsSchema.parse(settings)).toThrow()
    })

    it('rejects dailyLossLimitPct > 10', () => {
      const settings = {
        userId: 'user_1',
        mode: 'PAPER' as const,
        dailyLossLimitPct: 15.0,
        riskPerTradePct: 1.0,
        riskRewardRatio: 3,
        entryTypeFilter: 'ANY' as const,
        fibonacciAnchorMode: 'OPENING_RANGE' as const,
        maxOpenPositions: 3,
      }
      expect(() => tradingSettingsSchema.parse(settings)).toThrow()
    })

    it('rejects riskRewardRatio < 1', () => {
      const settings = {
        userId: 'user_1',
        mode: 'PAPER' as const,
        dailyLossLimitPct: 2.0,
        riskPerTradePct: 1.0,
        riskRewardRatio: 0.5,
        entryTypeFilter: 'ANY' as const,
        fibonacciAnchorMode: 'OPENING_RANGE' as const,
        maxOpenPositions: 3,
      }
      expect(() => tradingSettingsSchema.parse(settings)).toThrow()
    })

    it('rejects maxOpenPositions < 1', () => {
      const settings = {
        userId: 'user_1',
        mode: 'PAPER' as const,
        dailyLossLimitPct: 2.0,
        riskPerTradePct: 1.0,
        riskRewardRatio: 3,
        entryTypeFilter: 'ANY' as const,
        fibonacciAnchorMode: 'OPENING_RANGE' as const,
        maxOpenPositions: 0,
      }
      expect(() => tradingSettingsSchema.parse(settings)).toThrow()
    })
  })

  describe('openingRangeSchema', () => {
    it('accepts valid opening range', () => {
      const range = {
        symbol: 'SPY',
        date: '2026-09-11',
        high: 551.5,
        low: 550.0,
        formedAt: Date.now(),
      }
      expect(() => openingRangeSchema.parse(range)).not.toThrow()
    })

    it('rejects high <= low', () => {
      const range = {
        symbol: 'SPY',
        date: '2026-09-11',
        high: 550.0,
        low: 550.0,
        formedAt: Date.now(),
      }
      expect(() => openingRangeSchema.parse(range)).toThrow()
    })

    it('rejects negative prices', () => {
      const range = {
        symbol: 'SPY',
        date: '2026-09-11',
        high: -551.5,
        low: -552.0,
        formedAt: Date.now(),
      }
      expect(() => openingRangeSchema.parse(range)).toThrow()
    })

    it('rejects invalid date format', () => {
      const range = {
        symbol: 'SPY',
        date: 'invalid-date',
        high: 551.5,
        low: 550.0,
        formedAt: Date.now(),
      }
      expect(() => openingRangeSchema.parse(range)).toThrow()
    })
  })

  describe('orbSignalSchema', () => {
    it('accepts valid ORB signal', () => {
      const signal = {
        symbol: 'SPY',
        direction: 'BULLISH' as const,
        openingRange: {
          symbol: 'SPY',
          date: '2026-09-11',
          high: 551.5,
          low: 550.0,
          formedAt: Date.now(),
        },
        breakoutPrice: 551.6,
        breakoutAt: Date.now(),
      }
      expect(() => orbSignalSchema.parse(signal)).not.toThrow()
    })

    it('rejects breakoutPrice <= openingRange.low for BULLISH', () => {
      const signal = {
        symbol: 'SPY',
        direction: 'BULLISH' as const,
        openingRange: {
          symbol: 'SPY',
          date: '2026-09-11',
          high: 551.5,
          low: 550.0,
          formedAt: Date.now(),
        },
        breakoutPrice: 550.0,
        breakoutAt: Date.now(),
      }
      expect(() => orbSignalSchema.parse(signal)).toThrow()
    })

    it('rejects breakoutPrice >= openingRange.high for BEARISH', () => {
      const signal = {
        symbol: 'SPY',
        direction: 'BEARISH' as const,
        openingRange: {
          symbol: 'SPY',
          date: '2026-09-11',
          high: 551.5,
          low: 550.0,
          formedAt: Date.now(),
        },
        breakoutPrice: 551.5,
        breakoutAt: Date.now(),
      }
      expect(() => orbSignalSchema.parse(signal)).toThrow()
    })
  })
})
