import { describe, expect, test } from "vitest";
import {
  calculateDailyLossLimit,
  calculatePositionSize,
} from "@/lib/risk-calculator";
import type { DailyStats, TradingSettings } from "@/types/trading";

const baseSettings: TradingSettings = {
  userId: "user-1",
  mode: "PAPER",
  symbols: ["SPY"],
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
  maxHoldMinutes: null, useElevenAmSwitch: false, requireHighQualityBreakout: false,
};

describe("calculateDailyLossLimit", () => {
  test("allows trading when loss is under the daily limit", () => {
    const stats: DailyStats = {
      userId: "user-1",
      tradingDate: "2026-08-26",
      startingEquity: 10000,
      currentEquity: 9900,
      dailyPnl: -100,
      dailyPnlPct: -1,
      numTrades: 1,
      consecutiveLosses: 1,
    };

    const result = calculateDailyLossLimit(stats, baseSettings);

    expect(result.allowed).toBe(true);
    expect(result.currentLossPct).toBeCloseTo(1, 5);
    expect(result.limitPct).toBe(2);
  });

  test("blocks trading once the daily loss limit is reached", () => {
    const stats: DailyStats = {
      userId: "user-1",
      tradingDate: "2026-08-26",
      startingEquity: 10000,
      currentEquity: 9800,
      dailyPnl: -200,
      dailyPnlPct: -2,
      numTrades: 3,
      consecutiveLosses: 2,
    };

    const result = calculateDailyLossLimit(stats, baseSettings);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily loss limit/i);
  });

  test("blocks trading when consecutive-loss circuit breaker trips", () => {
    const stats: DailyStats = {
      userId: "user-1",
      tradingDate: "2026-08-26",
      startingEquity: 10000,
      currentEquity: 9950,
      dailyPnl: -50,
      dailyPnlPct: -0.5,
      numTrades: 3,
      consecutiveLosses: 3,
    };

    const result = calculateDailyLossLimit(stats, baseSettings);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/consecutive losses/i);
  });

  test("is unaffected when currently profitable", () => {
    const stats: DailyStats = {
      userId: "user-1",
      tradingDate: "2026-08-26",
      startingEquity: 10000,
      currentEquity: 10500,
      dailyPnl: 500,
      dailyPnlPct: 5,
      numTrades: 2,
      consecutiveLosses: 0,
    };

    const result = calculateDailyLossLimit(stats, baseSettings);

    expect(result.allowed).toBe(true);
    expect(result.currentLossPct).toBe(0);
  });
});

describe("calculatePositionSize", () => {
  test("sizes position from account equity, risk %, and stop distance", () => {
    const result = calculatePositionSize({
      accountEquity: 10000,
      entryPrice: 100,
      stopLoss: 95,
      settings: { ...baseSettings, maxTradePerOrderUsd: 5000 },
    });

    // risk amount = 10000 * 1% = 100; stop distance = 5 -> 20 shares ($2000, under the $5000 cap)
    expect(result.quantity).toBe(20);
    expect(result.riskAmountUsd).toBeCloseTo(100, 5);
    expect(result.cappedByMaxSpend).toBe(false);
  });

  test("caps position size at maxTradePerOrderUsd", () => {
    const result = calculatePositionSize({
      accountEquity: 100000,
      entryPrice: 100,
      stopLoss: 99,
      settings: baseSettings, // maxTradePerOrderUsd = 500
    });

    // Uncapped: risk 1000 / stop distance 1 = 1000 shares = $100,000 position
    // Capped to $500 max order -> 5 shares
    expect(result.quantity).toBe(5);
    expect(result.cappedByMaxSpend).toBe(true);
    expect(result.positionValueUsd).toBeLessThanOrEqual(500);
  });

  test("returns zero quantity when stop loss equals entry price", () => {
    const result = calculatePositionSize({
      accountEquity: 10000,
      entryPrice: 100,
      stopLoss: 100,
      settings: baseSettings,
    });

    expect(result.quantity).toBe(0);
  });

  test("halves risk for 0-1 DTE contracts — real incident 2026-09-17: a 1DTE TSLA call was sized largest of the day and decayed fastest", () => {
    const uncapped = calculatePositionSize({
      accountEquity: 10000,
      entryPrice: 100,
      stopLoss: 95,
      settings: { ...baseSettings, maxTradePerOrderUsd: 5000 },
    });
    const oneDte = calculatePositionSize({
      accountEquity: 10000,
      entryPrice: 100,
      stopLoss: 95,
      settings: { ...baseSettings, maxTradePerOrderUsd: 5000 },
      daysToExpiration: 1,
    });

    expect(oneDte.riskAmountUsd).toBeCloseTo(uncapped.riskAmountUsd / 2, 5);
    expect(oneDte.quantity).toBeLessThan(uncapped.quantity);
  });

  test("reduces risk to 75% for 2-3 DTE contracts and leaves 4+ DTE at full risk", () => {
    const threeDte = calculatePositionSize({
      accountEquity: 10000,
      entryPrice: 100,
      stopLoss: 95,
      settings: { ...baseSettings, maxTradePerOrderUsd: 5000 },
      daysToExpiration: 3,
    });
    const tenDte = calculatePositionSize({
      accountEquity: 10000,
      entryPrice: 100,
      stopLoss: 95,
      settings: { ...baseSettings, maxTradePerOrderUsd: 5000 },
      daysToExpiration: 10,
    });

    expect(threeDte.riskAmountUsd).toBeCloseTo(100 * 0.75, 5);
    expect(tenDte.riskAmountUsd).toBeCloseTo(100, 5);
  });
});
