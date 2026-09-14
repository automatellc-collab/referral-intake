import { beforeEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "@/lib/db";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { SettingsRepository, DEFAULT_SETTINGS } from "@/lib/repositories/settings-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";

let testDb: Database.Database;

beforeEach(() => {
  testDb = new Database(":memory:");
  resetDbForTests(testDb);
});

describe("TradeRepository", () => {
  test("creates and retrieves an open trade", () => {
    const repo = new TradeRepository(testDb);
    const trade = repo.create({
      userId: "user-1",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });

    expect(trade.status).toBe("OPEN");
    expect(repo.findById(trade.id)?.symbol).toBe("SPY");
    expect(repo.findOpenByUser("user-1")).toHaveLength(1);
    expect(repo.countOpenByUser("user-1")).toBe(1);
  });

  test("closes a trade and records pnl", () => {
    const repo = new TradeRepository(testDb);
    const trade = repo.create({
      userId: "user-1",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });

    const closed = repo.close(trade.id, 110, 100, "CLOSED");

    expect(closed.status).toBe("CLOSED");
    expect(closed.pnl).toBe(100);
    expect(repo.findOpenByUser("user-1")).toHaveLength(0);
    expect(repo.findHistoryByUser("user-1")).toHaveLength(1);
  });
});

describe("SettingsRepository", () => {
  test("returns defaults for a new user", () => {
    const repo = new SettingsRepository(testDb);
    const settings = repo.get("user-1");

    expect(settings.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(settings.dailyLossLimitPct).toBe(DEFAULT_SETTINGS.dailyLossLimitPct);
  });

  test("persists updates via upsert", () => {
    const repo = new SettingsRepository(testDb);
    repo.upsert({
      userId: "user-1",
      ...DEFAULT_SETTINGS,
      mode: "ALERTS",
      symbols: ["SPY", "QQQ"],
      dailyLossLimitPct: 3,
    });

    const settings = repo.get("user-1");
    expect(settings.mode).toBe("ALERTS");
    expect(settings.symbols).toEqual(["SPY", "QQQ"]);
    expect(settings.dailyLossLimitPct).toBe(3);
  });
});

describe("DailyStatsRepository", () => {
  test("creates today's stats on first access", () => {
    const repo = new DailyStatsRepository(testDb);
    const stats = repo.getOrCreateToday("user-1", 10000);

    expect(stats.startingEquity).toBe(10000);
    expect(stats.currentEquity).toBe(10000);
    expect(stats.numTrades).toBe(0);
  });

  test("accumulates pnl and consecutive losses across trades", () => {
    const repo = new DailyStatsRepository(testDb);
    repo.getOrCreateToday("user-1", 10000);

    repo.recordTradeResult("user-1", -100);
    const afterLoss = repo.recordTradeResult("user-1", -50);

    expect(afterLoss.currentEquity).toBe(9850);
    expect(afterLoss.numTrades).toBe(2);
    expect(afterLoss.consecutiveLosses).toBe(2);

    const afterWin = repo.recordTradeResult("user-1", 200);
    expect(afterWin.consecutiveLosses).toBe(0);
    expect(afterWin.currentEquity).toBe(10050);
  });
});
