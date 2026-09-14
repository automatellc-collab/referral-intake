import { beforeEach, describe, expect, test, vi } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "@/lib/db";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import { autoCloseExpiredPositions } from "@/lib/position-monitor";

let testDb: Database.Database;
let tradeRepo: TradeRepository;
let dailyStatsRepo: DailyStatsRepository;

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString().replace("T", " ").slice(0, 19);
}

beforeEach(() => {
  testDb = new Database(":memory:");
  resetDbForTests(testDb);
  tradeRepo = new TradeRepository(testDb);
  dailyStatsRepo = new DailyStatsRepository(testDb);
  dailyStatsRepo.getOrCreateToday("default", 10000);
});

describe("autoCloseExpiredPositions", () => {
  test("does nothing when maxHoldMinutes is null", async () => {
    tradeRepo.create({
      userId: "default",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });

    const marketDataClient = { getQuote: vi.fn() };
    const closed = await autoCloseExpiredPositions(
      { tradeRepo, dailyStatsRepo, marketDataClient },
      "default",
      null,
    );

    expect(closed).toHaveLength(0);
    expect(marketDataClient.getQuote).not.toHaveBeenCalled();
    expect(tradeRepo.findOpenByUser("default")).toHaveLength(1);
  });

  test("leaves a trade open when it hasn't reached maxHoldMinutes yet", async () => {
    const trade = tradeRepo.create({
      userId: "default",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });
    // freshly created -> age ~0 minutes, well under the 10-minute limit

    const marketDataClient = { getQuote: vi.fn() };
    const closed = await autoCloseExpiredPositions(
      { tradeRepo, dailyStatsRepo, marketDataClient },
      "default",
      10,
    );

    expect(closed).toHaveLength(0);
    expect(tradeRepo.findById(trade.id)?.status).toBe("OPEN");
  });

  test("force-closes a BUY position past maxHoldMinutes at the current quote price", async () => {
    const trade = tradeRepo.create({
      userId: "default",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });
    // Backdate createdAt so it's already past the limit.
    testDb
      .prepare(`UPDATE trades SET created_at = ? WHERE id = ?`)
      .run(minutesAgoIso(15), trade.id);

    const marketDataClient = { getQuote: vi.fn().mockResolvedValue({ symbol: "SPY", price: 103, timestamp: Date.now() }) };
    const closed = await autoCloseExpiredPositions(
      { tradeRepo, dailyStatsRepo, marketDataClient },
      "default",
      10,
    );

    expect(closed).toHaveLength(1);
    expect(closed[0].status).toBe("CLOSED");
    expect(closed[0].actualExitPrice).toBe(103);
    expect(closed[0].pnl).toBe(30); // (103-100)*10
    expect(tradeRepo.findOpenByUser("default")).toHaveLength(0);
  });

  test("computes pnl correctly for a SELL (bearish) position", async () => {
    const trade = tradeRepo.create({
      userId: "default",
      symbol: "SPY",
      side: "SELL",
      entryPrice: 100,
      quantity: 10,
      stopLoss: 105,
      takeProfit: 85,
      mode: "PAPER",
    });
    testDb
      .prepare(`UPDATE trades SET created_at = ? WHERE id = ?`)
      .run(minutesAgoIso(15), trade.id);

    const marketDataClient = { getQuote: vi.fn().mockResolvedValue({ symbol: "SPY", price: 97, timestamp: Date.now() }) };
    const closed = await autoCloseExpiredPositions(
      { tradeRepo, dailyStatsRepo, marketDataClient },
      "default",
      10,
    );

    expect(closed[0].pnl).toBe(30); // (100-97)*10
  });
});
