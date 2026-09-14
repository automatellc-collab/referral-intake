import { z } from 'zod'
import type { EntrySignal, ORBSignal, OpeningRange, Trade, TradingSettings } from '@/types/trading'

const VALID_SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'WMT', 'CRWD', 'NVDA'] as const

const baseSchema = z.object({
  symbol: z.enum(VALID_SYMBOLS, {
    errorMap: () => ({ message: `Symbol must be one of: ${VALID_SYMBOLS.join(', ')}` }),
  }),
})

export const entrySignalSchema: z.ZodType<EntrySignal> = z
  .object({
    type: z.enum(['RETEST', 'FIBONACCI']),
    symbol: z.enum(VALID_SYMBOLS),
    direction: z.enum(['BULLISH', 'BEARISH']),
    price: z.number().positive('Entry price must be positive'),
    stopLoss: z.number().positive('Stop loss must be positive'),
    takeProfit: z.number().positive('Take profit must be positive'),
    riskRewardRatio: z.number().min(1, 'Risk/reward ratio must be >= 1'),
    detectedAt: z.number(),
  })
  .refine((data) => {
    if (data.direction === 'BULLISH') {
      return data.price > data.stopLoss
    }
    return data.price < data.stopLoss
  }, {
    message: 'Entry price must be beyond stop loss in the direction of the breakout',
    path: ['price'],
  })
  .refine((data) => {
    if (data.direction === 'BULLISH') {
      return data.takeProfit > data.price
    }
    return data.takeProfit < data.price
  }, {
    message: 'Take profit must be beyond entry price in the direction of the breakout',
    path: ['takeProfit'],
  })

export const openingRangeSchema: z.ZodType<OpeningRange> = z.object({
  symbol: z.enum(VALID_SYMBOLS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  high: z.number().positive('High must be positive'),
  low: z.number().positive('Low must be positive'),
  formedAt: z.number(),
}).refine((data) => data.high > data.low, {
  message: 'High must be greater than low',
  path: ['high'],
})

export const orbSignalSchema: z.ZodType<ORBSignal> = z
  .object({
    symbol: z.enum(VALID_SYMBOLS),
    direction: z.enum(['BULLISH', 'BEARISH']),
    openingRange: openingRangeSchema,
    breakoutPrice: z.number().positive('Breakout price must be positive'),
    breakoutAt: z.number(),
  })
  .refine((data) => {
    if (data.direction === 'BULLISH') {
      return data.breakoutPrice > data.openingRange.high
    }
    return data.breakoutPrice < data.openingRange.low
  }, {
    message: 'Breakout price must exceed opening range in the breakout direction',
    path: ['breakoutPrice'],
  })

export const tradeSchema: z.ZodType<Trade> = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  symbol: z.enum(VALID_SYMBOLS),
  side: z.enum(['BUY', 'SELL']),
  entryPrice: z.number().positive('Entry price must be positive'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  stopLoss: z.number().positive('Stop loss must be positive'),
  takeProfit: z.number().positive('Take profit must be positive'),
  mode: z.enum(['PAPER', 'ALERTS', 'AUTOMATED']),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']),
  createdAt: z.date(),
  exitPrice: z.number().positive().optional(),
  exitTime: z.date().optional(),
  pnl: z.number().optional(),
}).refine((data) => {
  if (data.status === 'CLOSED' || data.status === 'CANCELLED') {
    return data.exitPrice !== undefined && data.exitTime !== undefined
  }
  return true
}, {
  message: 'Closed/cancelled trades must have exitPrice and exitTime',
  path: ['status'],
})

export const tradingSettingsSchema: z.ZodType<TradingSettings> = z.object({
  userId: z.string().min(1),
  mode: z.enum(['PAPER', 'ALERTS', 'AUTOMATED']),
  dailyLossLimitPct: z.number()
    .min(0.1, 'Daily loss limit must be at least 0.1%')
    .max(10, 'Daily loss limit must be at most 10%'),
  riskPerTradePct: z.number()
    .min(0.1, 'Risk per trade must be at least 0.1%')
    .max(5, 'Risk per trade must be at most 5%'),
  riskRewardRatio: z.number()
    .min(1, 'Risk/reward ratio must be at least 1:1'),
  entryTypeFilter: z.enum(['ANY', 'RETEST_ONLY', 'FIBONACCI_ONLY']),
  fibonacciAnchorMode: z.enum(['OPENING_RANGE', 'BREAKOUT_LEG']),
  maxOpenPositions: z.number()
    .int()
    .min(1, 'Max open positions must be at least 1')
    .max(10, 'Max open positions must be at most 10'),
  maxHoldMinutes: z.number().optional(),
})

export const candleSchema = z.object({
  timestamp: z.number(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative(),
}).refine((data) => data.high >= data.low, {
  message: 'Candle high must be >= low',
  path: ['high'],
}).refine((data) => data.high >= data.open && data.high >= data.close, {
  message: 'Candle high must be >= open and close',
  path: ['high'],
}).refine((data) => data.low <= data.open && data.low <= data.close, {
  message: 'Candle low must be <= open and close',
  path: ['low'],
})

export const quoteSchema = z.object({
  symbol: z.enum(VALID_SYMBOLS),
  bid: z.number().positive(),
  ask: z.number().positive(),
  lastPrice: z.number().positive(),
  volume: z.number().nonnegative(),
  timestamp: z.number(),
}).refine((data) => data.bid < data.ask, {
  message: 'Bid must be less than ask',
  path: ['bid'],
})

export type EntrySignalInput = z.infer<typeof entrySignalSchema>
export type OpeningRangeInput = z.infer<typeof openingRangeSchema>
export type ORBSignalInput = z.infer<typeof orbSignalSchema>
export type TradeInput = z.infer<typeof tradeSchema>
export type TradingSettingsInput = z.infer<typeof tradingSettingsSchema>
export type CandleInput = z.infer<typeof candleSchema>
export type QuoteInput = z.infer<typeof quoteSchema>
