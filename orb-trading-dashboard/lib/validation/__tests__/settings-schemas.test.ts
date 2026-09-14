import { describe, it, expect } from 'vitest'
import { settingsUpdateSchema, accountSettingsSchema } from '../settings-schemas'

describe('Settings Validation Schemas', () => {
  describe('settingsUpdateSchema', () => {
    it('accepts valid settings update', () => {
      const update = {
        mode: 'PAPER' as const,
        dailyLossLimitPct: 3.0,
        riskPerTradePct: 1.5,
      }
      expect(() => settingsUpdateSchema.parse(update)).not.toThrow()
    })

    it('allows partial updates', () => {
      const update = {
        dailyLossLimitPct: 2.5,
      }
      expect(() => settingsUpdateSchema.parse(update)).not.toThrow()
    })

    it('rejects empty update', () => {
      const update = {}
      expect(() => settingsUpdateSchema.parse(update)).toThrow()
    })

    it('rejects invalid mode', () => {
      const update = {
        mode: 'INVALID' as any,
      }
      expect(() => settingsUpdateSchema.parse(update)).toThrow()
    })

    it('rejects dailyLossLimitPct out of range', () => {
      const update = {
        dailyLossLimitPct: 15.0,
      }
      expect(() => settingsUpdateSchema.parse(update)).toThrow()
    })
  })

  describe('accountSettingsSchema', () => {
    it('accepts valid account settings', () => {
      const settings = {
        accountEquity: 10000,
        maxDrawdownPct: 20,
      }
      expect(() => accountSettingsSchema.parse(settings)).not.toThrow()
    })

    it('rejects zero account equity', () => {
      const settings = {
        accountEquity: 0,
        maxDrawdownPct: 20,
      }
      expect(() => accountSettingsSchema.parse(settings)).toThrow()
    })

    it('rejects negative maxDrawdownPct', () => {
      const settings = {
        accountEquity: 10000,
        maxDrawdownPct: -5,
      }
      expect(() => accountSettingsSchema.parse(settings)).toThrow()
    })

    it('rejects maxDrawdownPct > 100', () => {
      const settings = {
        accountEquity: 10000,
        maxDrawdownPct: 150,
      }
      expect(() => accountSettingsSchema.parse(settings)).toThrow()
    })
  })
})
