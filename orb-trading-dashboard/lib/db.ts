import Database from "better-sqlite3";
import path from "path";

const DB_PATH =
  process.env.SQLITE_DB_PATH || path.join(process.cwd(), "data", "orb-trading.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS trading_settings (
      user_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'PAPER',
      symbols TEXT NOT NULL DEFAULT '[]',
      daily_loss_limit_pct REAL NOT NULL DEFAULT 2,
      risk_per_trade_pct REAL NOT NULL DEFAULT 1,
      max_open_positions INTEGER NOT NULL DEFAULT 1,
      risk_reward_ratio REAL NOT NULL DEFAULT 3,
      stop_loss_buffer_pct REAL NOT NULL DEFAULT 0,
      max_consecutive_losses INTEGER NOT NULL DEFAULT 3,
      max_trade_per_order_usd REAL NOT NULL DEFAULT 500,
      max_daily_spend_usd REAL NOT NULL DEFAULT 2000,
      fibonacci_anchor_mode TEXT NOT NULL DEFAULT 'OPENING_RANGE',
      entry_type_filter TEXT NOT NULL DEFAULT 'ANY',
      max_hold_minutes INTEGER,
      use_eleven_am_switch INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      stop_loss REAL NOT NULL,
      take_profit REAL NOT NULL,
      actual_exit_price REAL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      pnl REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_trades_user_status ON trades(user_id, status);

    CREATE TABLE IF NOT EXISTS daily_stats (
      user_id TEXT NOT NULL,
      trading_date TEXT NOT NULL,
      starting_equity REAL NOT NULL,
      current_equity REAL NOT NULL,
      num_trades INTEGER NOT NULL DEFAULT 0,
      consecutive_losses INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, trading_date)
    );

    CREATE TABLE IF NOT EXISTS backtests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_trades INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      avg_profit_per_trade REAL NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  addColumnIfMissing(database, "trading_settings", "fibonacci_anchor_mode", "TEXT NOT NULL DEFAULT 'OPENING_RANGE'");
  addColumnIfMissing(database, "trading_settings", "entry_type_filter", "TEXT NOT NULL DEFAULT 'ANY'");
  addColumnIfMissing(database, "trading_settings", "max_hold_minutes", "INTEGER");
  addColumnIfMissing(database, "trading_settings", "use_eleven_am_switch", "INTEGER NOT NULL DEFAULT 0");
}

function addColumnIfMissing(
  database: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function resetDbForTests(testDb: Database.Database): void {
  db = testDb;
  runMigrations(testDb);
}
