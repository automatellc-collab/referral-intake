import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import type { Trade, TradeStatus } from "@/types/trading";

interface TradeRow {
  id: string;
  user_id: string;
  symbol: string;
  side: string;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  take_profit: number;
  actual_exit_price: number | null;
  mode: string;
  status: string;
  pnl: number | null;
  created_at: string;
  closed_at: string | null;
}

function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: row.side as Trade["side"],
    entryPrice: row.entry_price,
    quantity: row.quantity,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    actualExitPrice: row.actual_exit_price,
    mode: row.mode as Trade["mode"],
    status: row.status as TradeStatus,
    pnl: row.pnl,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

export interface CreateTradeInput {
  userId: string;
  symbol: string;
  side: Trade["side"];
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  mode: Trade["mode"];
}

export class TradeRepository {
  constructor(private readonly db: Database.Database = getDb()) {}

  create(input: CreateTradeInput): Trade {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO trades (id, user_id, symbol, side, entry_price, quantity, stop_loss, take_profit, mode, status)
         VALUES (@id, @userId, @symbol, @side, @entryPrice, @quantity, @stopLoss, @takeProfit, @mode, 'OPEN')`,
      )
      .run({ id, ...input });

    return this.findById(id) as Trade;
  }

  findById(id: string): Trade | null {
    const row = this.db.prepare(`SELECT * FROM trades WHERE id = ?`).get(id) as
      | TradeRow
      | undefined;
    return row ? rowToTrade(row) : null;
  }

  findOpenByUser(userId: string): Trade[] {
    const rows = this.db
      .prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY created_at DESC`)
      .all(userId) as TradeRow[];
    return rows.map(rowToTrade);
  }

  findHistoryByUser(userId: string, limit = 50): Trade[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM trades WHERE user_id = ? AND status != 'OPEN' ORDER BY closed_at DESC LIMIT ?`,
      )
      .all(userId, limit) as TradeRow[];
    return rows.map(rowToTrade);
  }

  close(id: string, exitPrice: number, pnl: number, status: TradeStatus): Trade {
    this.db
      .prepare(
        `UPDATE trades SET actual_exit_price = ?, pnl = ?, status = ?, closed_at = datetime('now') WHERE id = ?`,
      )
      .run(exitPrice, pnl, status, id);
    return this.findById(id) as Trade;
  }

  countOpenByUser(userId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM trades WHERE user_id = ? AND status = 'OPEN'`)
      .get(userId) as { count: number };
    return row.count;
  }

  /**
   * Whether this user has ANY trade today for this symbol — open or
   * already closed. A sticky signal (e.g. RETEST, which stays "active" for
   * the rest of the day once triggered) would otherwise re-enter every time
   * a prior trade closes via the time exit. `created_at` is UTC
   * (`datetime('now')`); comparing the UTC date is equivalent to the ET
   * trading day since US market hours never cross a UTC midnight boundary.
   */
  hasTradedTodayForSymbol(userId: string, symbol: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM trades
         WHERE user_id = ? AND symbol = ? AND date(created_at) = date('now')`,
      )
      .get(userId, symbol) as { count: number };
    return row.count > 0;
  }
}
