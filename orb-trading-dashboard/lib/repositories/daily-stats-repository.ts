import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { DailyStats } from "@/types/trading";

interface DailyStatsRow {
  user_id: string;
  trading_date: string;
  starting_equity: number;
  current_equity: number;
  num_trades: number;
  consecutive_losses: number;
}

function rowToStats(row: DailyStatsRow): DailyStats {
  const dailyPnl = row.current_equity - row.starting_equity;
  return {
    userId: row.user_id,
    tradingDate: row.trading_date,
    startingEquity: row.starting_equity,
    currentEquity: row.current_equity,
    dailyPnl,
    dailyPnlPct: row.starting_equity === 0 ? 0 : (dailyPnl / row.starting_equity) * 100,
    numTrades: row.num_trades,
    consecutiveLosses: row.consecutive_losses,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export class DailyStatsRepository {
  constructor(private readonly db: Database.Database = getDb()) {}

  getOrCreateToday(userId: string, startingEquity: number): DailyStats {
    const tradingDate = todayIso();
    const row = this.db
      .prepare(`SELECT * FROM daily_stats WHERE user_id = ? AND trading_date = ?`)
      .get(userId, tradingDate) as DailyStatsRow | undefined;

    if (row) {
      return rowToStats(row);
    }

    this.db
      .prepare(
        `INSERT INTO daily_stats (user_id, trading_date, starting_equity, current_equity, num_trades, consecutive_losses)
         VALUES (?, ?, ?, ?, 0, 0)`,
      )
      .run(userId, tradingDate, startingEquity, startingEquity);

    return this.getOrCreateToday(userId, startingEquity);
  }

  recordTradeResult(userId: string, pnl: number): DailyStats {
    const tradingDate = todayIso();
    const current = this.getOrCreateToday(userId, 0);
    const nextConsecutiveLosses = pnl < 0 ? current.consecutiveLosses + 1 : 0;

    this.db
      .prepare(
        `UPDATE daily_stats
         SET current_equity = current_equity + ?, num_trades = num_trades + 1, consecutive_losses = ?
         WHERE user_id = ? AND trading_date = ?`,
      )
      .run(pnl, nextConsecutiveLosses, userId, tradingDate);

    const row = this.db
      .prepare(`SELECT * FROM daily_stats WHERE user_id = ? AND trading_date = ?`)
      .get(userId, tradingDate) as DailyStatsRow;

    return rowToStats(row);
  }
}
