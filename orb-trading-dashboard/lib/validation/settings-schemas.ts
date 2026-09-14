import { z } from 'zod'

export const settingsUpdateSchema = z.object({
  mode: z.enum(['PAPER', 'ALERTS', 'AUTOMATED']).optional(),
  dailyLossLimitPct: z.number()
    .min(0.1)
    .max(10)
    .optional(),
  riskPerTradePct: z.number()
    .min(0.1)
    .max(5)
    .optional(),
  riskRewardRatio: z.number()
    .min(1)
    .optional(),
  entryTypeFilter: z.enum(['ANY', 'RETEST_ONLY', 'FIBONACCI_ONLY']).optional(),
  fibonacciAnchorMode: z.enum(['OPENING_RANGE', 'BREAKOUT_LEG']).optional(),
  maxOpenPositions: z.number().int().min(1).max(10).optional(),
  maxHoldMinutes: z.number().int().min(1).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one setting must be provided for update' }
)

export const accountSettingsSchema = z.object({
  accountEquity: z.number().positive('Account equity must be positive'),
  maxDrawdownPct: z.number()
    .min(0, 'Max drawdown cannot be negative')
    .max(100, 'Max drawdown cannot exceed 100%'),
})

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>
export type AccountSettingsInput = z.infer<typeof accountSettingsSchema>
