import { z } from 'zod'

const VALID_SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'WMT', 'CRWD', 'NVDA'] as const

export const candleSchema = z.object({
  timestamp: z.number(),
  open: z.number().positive('Open price must be positive'),
  high: z.number().positive('High price must be positive'),
  low: z.number().positive('Low price must be positive'),
  close: z.number().positive('Close price must be positive'),
  volume: z.number().nonnegative('Volume must be non-negative'),
}).refine((data) => data.high >= data.low, {
  message: 'High must be >= low',
  path: ['high'],
}).refine((data) => data.high >= data.open, {
  message: 'High must be >= open',
  path: ['high'],
}).refine((data) => data.high >= data.close, {
  message: 'High must be >= close',
  path: ['high'],
}).refine((data) => data.low <= data.open, {
  message: 'Low must be <= open',
  path: ['low'],
}).refine((data) => data.low <= data.close, {
  message: 'Low must be <= close',
  path: ['low'],
})

export const quoteSchema = z.object({
  symbol: z.enum(VALID_SYMBOLS, {
    errorMap: () => ({ message: `Symbol must be one of: ${VALID_SYMBOLS.join(', ')}` }),
  }),
  bid: z.number().positive('Bid must be positive'),
  ask: z.number().positive('Ask must be positive'),
  lastPrice: z.number().positive('Last price must be positive'),
  volume: z.number().nonnegative('Volume must be non-negative'),
  timestamp: z.number(),
}).refine((data) => data.bid < data.ask, {
  message: 'Bid must be less than ask',
  path: ['bid'],
})

export const snapshotSchema = z.object({
  symbol: z.enum(VALID_SYMBOLS),
  quote: quoteSchema,
  todayCandles: z.array(candleSchema),
  dataHealth: z.object({
    isLive: z.boolean(),
    staleSinceMinutes: z.number(),
    openingRangeComplete: z.boolean(),
  }),
  openingRange: z.object({
    symbol: z.string(),
    date: z.string(),
    high: z.number(),
    low: z.number(),
    formedAt: z.number(),
  }).optional(),
})

export type CandleInput = z.infer<typeof candleSchema>
export type QuoteInput = z.infer<typeof quoteSchema>
export type SnapshotInput = z.infer<typeof snapshotSchema>
