import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { TradingSettings } from "@/types/trading";

interface SettingsRow {
  user_id: string;
  mode: string;
  symbols: string;
  daily_loss_limit_pct: number;
  risk_per_trade_pct: number;
  max_open_positions: number;
  risk_reward_ratio: number;
  stop_loss_buffer_pct: number;
  max_consecutive_losses: number;
  max_trade_per_order_usd: number;
  max_daily_spend_usd: number;
  fibonacci_anchor_mode: string;
  entry_type_filter: string;
  max_hold_minutes: number | null;
  use_eleven_am_switch: number;
  require_high_quality_breakout: number;
}

function rowToSettings(row: SettingsRow): TradingSettings {
  return {
    userId: row.user_id,
    mode: row.mode as TradingSettings["mode"],
    symbols: JSON.parse(row.symbols),
    dailyLossLimitPct: row.daily_loss_limit_pct,
    riskPerTradePct: row.risk_per_trade_pct,
    maxOpenPositions: row.max_open_positions,
    riskRewardRatio: row.risk_reward_ratio,
    stopLossBufferPct: row.stop_loss_buffer_pct,
    maxConsecutiveLosses: row.max_consecutive_losses,
    maxTradePerOrderUsd: row.max_trade_per_order_usd,
    maxDailySpendUsd: row.max_daily_spend_usd,
    fibonacciAnchorMode: row.fibonacci_anchor_mode as TradingSettings["fibonacciAnchorMode"],
    entryTypeFilter: row.entry_type_filter as TradingSettings["entryTypeFilter"],
    maxHoldMinutes: row.max_hold_minutes,
    useElevenAmSwitch: Boolean(row.use_eleven_am_switch),
    requireHighQualityBreakout: Boolean(row.require_high_quality_breakout),
  };
}

export const DEFAULT_SETTINGS: Omit<TradingSettings, "userId"> = {
  mode: "PAPER",
  symbols: [],
  dailyLossLimitPct: 2,
  riskPerTradePct: 1,
  maxOpenPositions: 1,
  riskRewardRatio: 3,
  stopLossBufferPct: 0,
  maxConsecutiveLosses: 3,
  maxTradePerOrderUsd: 500,
  maxDailySpendUsd: 2000,
  fibonacciAnchorMode: "OPENING_RANGE",
  entryTypeFilter: "ANY",
  maxHoldMinutes: null,
  useElevenAmSwitch: false,
  requireHighQualityBreakout: false,
};

export class SettingsRepository {
  constructor(private readonly db: Database.Database = getDb()) {}

  get(userId: string): TradingSettings {
    const row = this.db
      .prepare(`SELECT * FROM trading_settings WHERE user_id = ?`)
      .get(userId) as SettingsRow | undefined;

    if (!row) {
      return this.upsert({ userId, ...DEFAULT_SETTINGS });
    }

    return rowToSettings(row);
  }

  upsert(settings: TradingSettings): TradingSettings {
    this.db
      .prepare(
        `INSERT INTO trading_settings (
           user_id, mode, symbols, daily_loss_limit_pct, risk_per_trade_pct,
           max_open_positions, risk_reward_ratio, stop_loss_buffer_pct,
           max_consecutive_losses, max_trade_per_order_usd, max_daily_spend_usd,
           fibonacci_anchor_mode, entry_type_filter, max_hold_minutes,
           use_eleven_am_switch, require_high_quality_breakout, updated_at
         ) VALUES (
           @userId, @mode, @symbols, @dailyLossLimitPct, @riskPerTradePct,
           @maxOpenPositions, @riskRewardRatio, @stopLossBufferPct,
           @maxConsecutiveLosses, @maxTradePerOrderUsd, @maxDailySpendUsd,
           @fibonacciAnchorMode, @entryTypeFilter, @maxHoldMinutes,
           @useElevenAmSwitch, @requireHighQualityBreakout, datetime('now')
         )
         ON CONFLICT(user_id) DO UPDATE SET
           mode = excluded.mode,
           symbols = excluded.symbols,
           daily_loss_limit_pct = excluded.daily_loss_limit_pct,
           risk_per_trade_pct = excluded.risk_per_trade_pct,
           max_open_positions = excluded.max_open_positions,
           risk_reward_ratio = excluded.risk_reward_ratio,
           stop_loss_buffer_pct = excluded.stop_loss_buffer_pct,
           max_consecutive_losses = excluded.max_consecutive_losses,
           max_trade_per_order_usd = excluded.max_trade_per_order_usd,
           max_daily_spend_usd = excluded.max_daily_spend_usd,
           fibonacci_anchor_mode = excluded.fibonacci_anchor_mode,
           entry_type_filter = excluded.entry_type_filter,
           max_hold_minutes = excluded.max_hold_minutes,
           use_eleven_am_switch = excluded.use_eleven_am_switch,
           require_high_quality_breakout = excluded.require_high_quality_breakout,
           updated_at = datetime('now')`,
      )
      .run({
        ...settings,
        symbols: JSON.stringify(settings.symbols),
        useElevenAmSwitch: settings.useElevenAmSwitch ? 1 : 0,
        requireHighQualityBreakout: settings.requireHighQualityBreakout ? 1 : 0,
      });

    return this.get(settings.userId);
  }
}
