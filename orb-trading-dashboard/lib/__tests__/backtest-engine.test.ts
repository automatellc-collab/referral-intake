import { describe, expect, test } from "vitest";
import { runBacktest } from "@/lib/backtest-engine";
import type { Candle, TradingSettings } from "@/types/trading";

function etTimestamp(day: number, hour: number, minute: number): number {
  return Date.UTC(2026, 7, day, hour + 4, minute, 0);
}

function candle(
  day: number,
  hour: number,
  minute: number,
  o: number,
  h: number,
  l: number,
  c: number,
): Candle {
  return { timestamp: etTimestamp(day, hour, minute), open: o, high: h, low: l, close: c, volume: 1000 };
}

const settings: TradingSettings = {
  userId: "user-1",
  mode: "PAPER",
  symbols: ["SPY"],
  dailyLossLimitPct: 100, // disabled for backtest purposes
  riskPerTradePct: 1,
  maxOpenPositions: 1,
  riskRewardRatio: 3,
  stopLossBufferPct: 0,
  maxConsecutiveLosses: 100,
  maxTradePerOrderUsd: 100000,
  maxDailySpendUsd: 1000000,
  fibonacciAnchorMode: "OPENING_RANGE",
  entryTypeFilter: "ANY",
  maxHoldMinutes: null,
};

describe("runBacktest", () => {
  test("simulates a winning RETEST trade through to take-profit on a single day", () => {
    const candles: Candle[] = [
      // Opening range 9:30-9:44: high=105, low=99
      candle(26, 9, 30, 100, 102, 99, 101),
      candle(26, 9, 40, 101, 105, 100, 104),
      // Breakout above 105
      candle(26, 9, 50, 105, 107, 105, 106.5),
      // Retest + rejection candle at the ORB high (105)
      candle(26, 9, 55, 106, 106.2, 104.8, 106),
      // Trade runs to take-profit (entry ~106, stop 99, R:R 3 -> target ~127)
      candle(26, 10, 0, 106, 130, 105, 128),
    ];

    const result = runBacktest({
      symbol: "SPY",
      candles,
      settings,
      startingEquity: 10000,
    });

    expect(result.totalTrades).toBe(1);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(0);
    expect(result.trades[0].direction).toBe("BULLISH");
    expect(result.trades[0].pnl).toBeGreaterThan(0);
  });

  test("simulates a losing trade that hits the stop loss", () => {
    const candles: Candle[] = [
      candle(26, 9, 30, 100, 102, 99, 101),
      candle(26, 9, 40, 101, 105, 100, 104),
      candle(26, 9, 50, 105, 107, 105, 106.5),
      candle(26, 9, 55, 106, 106.2, 104.8, 106), // retest rejection -> entry
      candle(26, 10, 0, 106, 106.5, 98, 99), // reverses hard, hits stop loss (99)
    ];

    const result = runBacktest({
      symbol: "SPY",
      candles,
      settings,
      startingEquity: 10000,
    });

    expect(result.totalTrades).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.trades[0].pnl).toBeLessThan(0);
  });

  test("aggregates win rate and equity drawdown across multiple days", () => {
    const winningDay: Candle[] = [
      candle(26, 9, 30, 100, 102, 99, 101),
      candle(26, 9, 40, 101, 105, 100, 104),
      candle(26, 9, 50, 105, 107, 105, 106.5),
      candle(26, 9, 55, 106, 106.2, 104.8, 106),
      candle(26, 10, 0, 106, 130, 105, 128),
    ];
    const losingDay: Candle[] = [
      candle(27, 9, 30, 100, 102, 99, 101),
      candle(27, 9, 40, 101, 105, 100, 104),
      candle(27, 9, 50, 105, 107, 105, 106.5),
      candle(27, 9, 55, 106, 106.2, 104.8, 106),
      candle(27, 10, 0, 106, 106.5, 98, 99),
    ];

    const result = runBacktest({
      symbol: "SPY",
      candles: [...winningDay, ...losingDay],
      settings,
      startingEquity: 10000,
    });

    expect(result.totalTrades).toBe(2);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.winRate).toBeCloseTo(50, 5);
    expect(result.maxDrawdownPct).toBeGreaterThan(0);
  });

  test("skips a day with no opening range candles", () => {
    const candles: Candle[] = [candle(26, 12, 0, 100, 101, 99, 100)]; // midday only
    const result = runBacktest({ symbol: "SPY", candles, settings, startingEquity: 10000 });
    expect(result.totalTrades).toBe(0);
  });

  test("maxHoldBars exits early via TIME_EXIT instead of riding out to the eventual stop-loss", () => {
    const candles: Candle[] = [
      candle(26, 9, 30, 100, 102, 99, 101),
      candle(26, 9, 40, 101, 105, 100, 104),
      // Breakout candle: low stays above the ORB high, so its own wick
      // doesn't count as a same-bar "retest".
      candle(26, 9, 50, 105.5, 107, 105.2, 106.5),
      // Genuine retest one bar later -> entry at 106
      candle(26, 9, 55, 106.3, 106.5, 104.8, 106),
      // One bar after entry: still fine, no stop/target hit yet
      candle(26, 10, 0, 106, 107.2, 105.5, 107),
      // Later still: reverses hard and hits stop-loss (99) if held this long
      candle(26, 10, 5, 107, 107.1, 95, 96),
    ];

    const withoutLimit = runBacktest({ symbol: "SPY", candles, settings, startingEquity: 10000 });
    expect(withoutLimit.trades[0].exitReason).toBe("STOP_LOSS");
    expect(withoutLimit.trades[0].pnl).toBeLessThan(0);

    const withOneBarLimit = runBacktest({
      symbol: "SPY",
      candles,
      settings,
      startingEquity: 10000,
      maxHoldBars: 1,
    });
    expect(withOneBarLimit.trades[0].exitReason).toBe("TIME_EXIT");
    expect(withOneBarLimit.trades[0].exitPrice).toBe(107); // close of the one held bar
    expect(withOneBarLimit.trades[0].pnl).toBeGreaterThan(0);
  });
});
