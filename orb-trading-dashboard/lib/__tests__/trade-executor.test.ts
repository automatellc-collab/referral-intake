import { beforeEach, describe, expect, test, vi } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "@/lib/db";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import { executeEntrySignal } from "@/lib/trade-executor";
import type { EntrySignal, TradingSettings } from "@/types/trading";

let testDb: Database.Database;
let tradeRepo: TradeRepository;
let dailyStatsRepo: DailyStatsRepository;

const settings: TradingSettings = {
  userId: "user-1",
  mode: "PAPER",
  symbols: ["SPY"],
  dailyLossLimitPct: 2,
  riskPerTradePct: 1,
  maxOpenPositions: 1,
  riskRewardRatio: 3,
  stopLossBufferPct: 0,
  maxConsecutiveLosses: 3,
  maxTradePerOrderUsd: 5000,
  maxDailySpendUsd: 20000,
  fibonacciAnchorMode: "OPENING_RANGE",
  entryTypeFilter: "ANY",
  maxHoldMinutes: null, useElevenAmSwitch: false, requireHighQualityBreakout: false,
};

const entry: EntrySignal = {
  type: "RETEST",
  symbol: "SPY",
  direction: "BULLISH",
  price: 100,
  stopLoss: 95,
  takeProfit: 115,
  riskRewardRatio: 3,
  detectedAt: Date.now(),
};

beforeEach(() => {
  testDb = new Database(":memory:");
  resetDbForTests(testDb);
  tradeRepo = new TradeRepository(testDb);
  dailyStatsRepo = new DailyStatsRepository(testDb);
});

describe("executeEntrySignal — PAPER mode", () => {
  test("creates a simulated open trade", async () => {
    dailyStatsRepo.getOrCreateToday("user-1", 10000);

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo },
      { userId: "user-1", entry, settings: { ...settings, mode: "PAPER" }, accountEquity: 10000 },
    );

    expect(result.status).toBe("EXECUTED");
    expect(result.trade?.mode).toBe("PAPER");
    expect(result.trade?.side).toBe("BUY");
    expect(tradeRepo.findOpenByUser("user-1")).toHaveLength(1);
  });
});

describe("executeEntrySignal — ALERTS mode", () => {
  test("does not create a trade, returns an alert payload", async () => {
    dailyStatsRepo.getOrCreateToday("user-1", 10000);

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo },
      { userId: "user-1", entry, settings: { ...settings, mode: "ALERTS" }, accountEquity: 10000 },
    );

    expect(result.status).toBe("ALERTED");
    expect(result.trade).toBeUndefined();
    expect(tradeRepo.findOpenByUser("user-1")).toHaveLength(0);
  });
});

describe("executeEntrySignal — AUTOMATED mode", () => {
  test("blocks with a clear reason when the Robinhood client can't place live orders", async () => {
    dailyStatsRepo.getOrCreateToday("user-1", 10000);
    const robinhoodClient = {
      placeEquityOrder: vi.fn().mockRejectedValue(new Error("Live trading is not enabled.")),
    };

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo, robinhoodClient },
      { userId: "user-1", entry, settings: { ...settings, mode: "AUTOMATED" }, accountEquity: 10000 },
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toMatch(/live trading is not enabled/i);
    expect(tradeRepo.findOpenByUser("user-1")).toHaveLength(0);
  });
});

describe("executeEntrySignal — risk gates", () => {
  test("blocks when the daily loss limit has been reached", async () => {
    dailyStatsRepo.getOrCreateToday("user-1", 10000);
    dailyStatsRepo.recordTradeResult("user-1", -250); // -2.5%, past the 2% limit

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo },
      { userId: "user-1", entry, settings, accountEquity: 9750 },
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toMatch(/daily loss limit/i);
  });

  test("blocks when max open positions is already reached", async () => {
    dailyStatsRepo.getOrCreateToday("user-1", 10000);
    tradeRepo.create({
      userId: "user-1",
      symbol: "QQQ",
      side: "BUY",
      entryPrice: 50,
      quantity: 10,
      stopLoss: 48,
      takeProfit: 56,
      mode: "PAPER",
    });

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo },
      { userId: "user-1", entry, settings: { ...settings, maxOpenPositions: 1 }, accountEquity: 10000 },
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toMatch(/max open positions/i);
  });

  test("blocks a second entry for the same symbol today even after the first trade already closed", async () => {
    // Real incident (2026-08-31): RETEST is "sticky" for the rest of the
    // day once triggered, so once the 40-min hold closes a trade, the very
    // next poll opens an identical new one at the same level — forever.
    // One entry per symbol per day is the actual trading discipline here.
    dailyStatsRepo.getOrCreateToday("user-1", 10000);
    const firstTrade = tradeRepo.create({
      userId: "user-1",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });
    tradeRepo.close(firstTrade.id, 102, 20, "CLOSED"); // already closed, not open

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo },
      { userId: "user-1", entry, settings, accountEquity: 10000 },
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toMatch(/already traded spy today/i);
    expect(tradeRepo.findHistoryByUser("user-1")).toHaveLength(1); // no second trade created
  });

  test("allows the first entry of the day for a different symbol even if one symbol already traded", async () => {
    dailyStatsRepo.getOrCreateToday("user-1", 10000);
    const firstTrade = tradeRepo.create({
      userId: "user-1",
      symbol: "QQQ",
      side: "BUY",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });
    tradeRepo.close(firstTrade.id, 102, 20, "CLOSED");

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo },
      { userId: "user-1", entry, settings, accountEquity: 10000 }, // entry.symbol is "SPY"
    );

    expect(result.status).toBe("EXECUTED");
  });

  test("blocks when computed position size is zero", async () => {
    dailyStatsRepo.getOrCreateToday("user-1", 10000);
    const zeroSizeEntry: EntrySignal = { ...entry, stopLoss: entry.price }; // no stop distance

    const result = await executeEntrySignal(
      { tradeRepo, dailyStatsRepo },
      { userId: "user-1", entry: zeroSizeEntry, settings, accountEquity: 10000 },
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toMatch(/position size/i);
  });
});
