import { describe, expect, test } from "vitest";
import {
  buildOpeningRange,
  detectBreakout,
  getEntrySignal,
} from "@/lib/orb-strategy";
import type { Candle, TradingSettings } from "@/types/trading";

function etTimestamp(hour: number, minute: number): number {
  return Date.UTC(2026, 7, 26, hour + 4, minute, 0);
}

function candle(hour: number, minute: number, o: number, h: number, l: number, c: number): Candle {
  return { timestamp: etTimestamp(hour, minute), open: o, high: h, low: l, close: c, volume: 1000 };
}

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
  maxHoldMinutes: null,
};

describe("buildOpeningRange", () => {
  test("computes high/low from the 9:30-9:45 ET candles only", () => {
    const candles = [
      candle(9, 30, 100, 102, 99, 101),
      candle(9, 35, 101, 104, 100, 103),
      candle(9, 40, 103, 105, 102, 104), // highest high = 105
      candle(9, 45, 104, 110, 103, 109), // outside window, must be excluded
    ];

    const range = buildOpeningRange("SPY", "2026-08-26", candles);

    expect(range).not.toBeNull();
    expect(range?.high).toBe(105);
    expect(range?.low).toBe(99);
  });

  test("returns null when no candles fall within the opening range window", () => {
    const candles = [candle(10, 0, 100, 101, 99, 100)];
    const range = buildOpeningRange("SPY", "2026-08-26", candles);
    expect(range).toBeNull();
  });
});

describe("detectBreakout", () => {
  const openingRange = { symbol: "SPY", date: "2026-08-26", high: 105, low: 99, formedAt: etTimestamp(9, 45) };

  test("detects a bullish breakout when price closes above the ORB high", () => {
    const signal = detectBreakout(openingRange, 106, etTimestamp(9, 50));
    expect(signal?.direction).toBe("BULLISH");
  });

  test("detects a bearish breakout when price closes below the ORB low", () => {
    const signal = detectBreakout(openingRange, 98, etTimestamp(9, 50));
    expect(signal?.direction).toBe("BEARISH");
  });

  test("returns null when price is still inside the opening range", () => {
    const signal = detectBreakout(openingRange, 102, etTimestamp(9, 50));
    expect(signal).toBeNull();
  });
});

describe("getEntrySignal", () => {
  const openingRange = { symbol: "SPY", date: "2026-08-26", high: 105, low: 99, formedAt: etTimestamp(9, 45) };
  const bullishSignal = {
    symbol: "SPY",
    direction: "BULLISH" as const,
    openingRange,
    breakoutPrice: 106,
    breakoutAt: etTimestamp(9, 50),
  };

  test("returns a RETEST entry on a rejection candle back at the ORB high", () => {
    // Price breaks out, pulls back to retest the ORB high, then shows a rejection
    // candle (wicks below the high, closes back above it).
    const candles = [
      candle(9, 50, 105, 107, 105, 106.5),
      candle(9, 55, 106, 106.5, 104.5, 106), // pullback
      candle(10, 0, 105.5, 106.2, 104.8, 106), // rejection candle: dips to ORB high area, closes strong
    ];

    const entry = getEntrySignal(bullishSignal, candles, settings);

    expect(entry).not.toBeNull();
    expect(entry?.type).toBe("RETEST");
    expect(entry?.direction).toBe("BULLISH");
    expect(entry?.stopLoss).toBe(openingRange.low);
    expect(entry?.riskRewardRatio).toBe(settings.riskRewardRatio);
  });

  test("returns a FIBONACCI entry when price retraces into the 0.236-0.382 zone of the opening range without a clean rejection at the ORB high", () => {
    // Fib zone for openingRange [low=99, high=105], BULLISH: ~[102.71, 103.58]
    const fibCandles = [
      candle(9, 50, 106, 108, 106, 107), // extends higher first, no dip into ORB high
      candle(9, 55, 105, 105.5, 102.5, 103.2), // deep pullback lands inside the fib zone
    ];

    const entry = getEntrySignal(bullishSignal, fibCandles, settings);

    expect(entry).not.toBeNull();
    expect(entry?.type).toBe("FIBONACCI");
    expect(entry?.direction).toBe("BULLISH");
  });

  test("freezes a RETEST entry's price/time at the actual rejection candle, not the latest poll", () => {
    // Real incident (2026-08-31): the rejection fires once, but the app
    // polls every 5 min. A live user was nearly misled into re-pricing an
    // already-triggered signal off whatever candle happened to be latest.
    const rejectionCandle = candle(10, 0, 105.5, 106.2, 104.8, 106); // the actual trigger
    const candlesAtTriggerTime = [
      candle(9, 50, 105, 107, 105, 106.5),
      candle(9, 55, 106, 106.5, 105.5, 106), // pullback, but stays above the ORB high — not itself a rejection
      rejectionCandle,
    ];
    const laterCandles = [
      ...candlesAtTriggerTime,
      candle(10, 5, 106, 108, 105.8, 107.9), // market kept moving after the trigger
      candle(10, 10, 108, 109.5, 107.5, 109.2),
    ];

    const entryAtTrigger = getEntrySignal(bullishSignal, candlesAtTriggerTime, settings);
    const entryOnLaterPoll = getEntrySignal(bullishSignal, laterCandles, settings);

    expect(entryAtTrigger?.type).toBe("RETEST");
    expect(entryOnLaterPoll?.type).toBe("RETEST");
    // Price and detection time must match the rejection candle itself,
    // not drift to the close/timestamp of whatever candle is newest.
    expect(entryOnLaterPoll?.price).toBe(entryAtTrigger?.price);
    expect(entryOnLaterPoll?.detectedAt).toBe(entryAtTrigger?.detectedAt);
    expect(entryOnLaterPoll?.price).toBe(rejectionCandle.close);
    expect(entryOnLaterPoll?.detectedAt).toBe(rejectionCandle.timestamp);
  });

  test("returns null when neither a retest rejection nor a Fibonacci pullback has occurred", () => {
    const candles = [candle(9, 50, 106, 108, 106, 107.8)]; // still running, no pullback at all
    const entry = getEntrySignal(bullishSignal, candles, settings);
    expect(entry).toBeNull();
  });

  describe("fibonacciAnchorMode: BREAKOUT_LEG", () => {
    const breakoutLegSettings = { ...settings, fibonacciAnchorMode: "BREAKOUT_LEG" as const };

    test("retraces the swing high reached after breakout, not the fixed opening range", () => {
      // ORB high=105. Price runs to a swing high of 110, then pulls back into
      // the 0.236-0.382 zone of the 105-110 leg (~[108.09, 108.82]) — well
      // short of ever nearing the opening range's own fib zone (~[102.71, 103.58]).
      const candles = [
        candle(9, 50, 106, 110, 106, 109), // extends to swing high 110, no dip to ORB high (low=106 > 105)
        candle(9, 55, 109, 109.2, 108.2, 108.4), // pulls back into the breakout-leg fib zone
      ];

      const opening = getEntrySignal(bullishSignal, candles, settings); // OPENING_RANGE mode
      expect(opening).toBeNull(); // price never got close to the opening-range zone

      const breakoutLeg = getEntrySignal(bullishSignal, candles, breakoutLegSettings);
      expect(breakoutLeg).not.toBeNull();
      expect(breakoutLeg?.type).toBe("FIBONACCI");
    });

    test("does not throw when the swing high hasn't cleared the ORB level yet", () => {
      // First candle after breakout whose high sits right at the ORB level —
      // the breakout-leg anchors would collapse to a zero-width range.
      const candles = [candle(9, 50, 105, 105, 104.5, 104.9)];
      expect(() => getEntrySignal(bullishSignal, candles, breakoutLegSettings)).not.toThrow();
      expect(getEntrySignal(bullishSignal, candles, breakoutLegSettings)).toBeNull();
    });
  });

  describe("entryTypeFilter", () => {
    const retestCandles = [
      candle(9, 50, 105, 107, 105, 106.5),
      candle(9, 55, 106, 106.5, 104.5, 106),
      candle(10, 0, 105.5, 106.2, 104.8, 106),
    ];
    const fibCandles = [
      candle(9, 50, 106, 108, 106, 107),
      candle(9, 55, 105, 105.5, 102.5, 103.2),
    ];

    test("FIBONACCI_ONLY ignores an otherwise-valid retest and finds nothing", () => {
      const filterSettings = { ...settings, entryTypeFilter: "FIBONACCI_ONLY" as const };
      expect(getEntrySignal(bullishSignal, retestCandles, filterSettings)).toBeNull();
    });

    test("FIBONACCI_ONLY still returns a Fibonacci entry when one is present", () => {
      const filterSettings = { ...settings, entryTypeFilter: "FIBONACCI_ONLY" as const };
      const entry = getEntrySignal(bullishSignal, fibCandles, filterSettings);
      expect(entry?.type).toBe("FIBONACCI");
    });

    test("RETEST_ONLY ignores an otherwise-valid Fibonacci pullback and finds nothing", () => {
      const filterSettings = { ...settings, entryTypeFilter: "RETEST_ONLY" as const };
      expect(getEntrySignal(bullishSignal, fibCandles, filterSettings)).toBeNull();
    });

    test("RETEST_ONLY still returns a retest entry when one is present", () => {
      const filterSettings = { ...settings, entryTypeFilter: "RETEST_ONLY" as const };
      const entry = getEntrySignal(bullishSignal, retestCandles, filterSettings);
      expect(entry?.type).toBe("RETEST");
    });
  });

  describe("post-11am 10-minute chart switch", () => {
    test("before 11am, a two-candle pattern is evaluated on raw 5-minute candles and finds no rejection", () => {
      // Neither candle alone is a rejection: the first dips to the ORB high
      // but closes back below it; the second never dips to the ORB high at all.
      const candles = [
        candle(10, 0, 106, 106.2, 104.5, 104.8),
        candle(10, 5, 104.8, 106.3, 105.2, 106.1),
      ];

      const entry = getEntrySignal(bullishSignal, candles, settings);
      expect(entry).toBeNull();
    });

    test("after 11am, the same two-candle pattern is merged into one 10-minute bar and DOES register as a rejection", () => {
      // Same OHLC shape as above, just timestamped after 11am. Merged into a
      // single 10-minute bar: low=104.5 (dips to/through the ORB high),
      // close=106.1 (closes back above it) — a clean rejection the raw
      // 5-minute view above missed because neither individual candle alone
      // both dipped AND closed back above.
      const candles = [
        candle(11, 0, 106, 106.2, 104.5, 104.8),
        candle(11, 5, 104.8, 106.3, 105.2, 106.1),
      ];

      const entry = getEntrySignal(bullishSignal, candles, settings);

      expect(entry).not.toBeNull();
      expect(entry?.type).toBe("RETEST");
      expect(entry?.price).toBe(106.1);
      expect(entry?.detectedAt).toBe(etTimestamp(11, 0)); // bucketed to the 10-minute bar start
    });

    test("after 11am, a lone still-forming 5-minute candle is treated as its own (incomplete) 10-minute bar", () => {
      const candles = [candle(11, 0, 105.5, 106.2, 104.8, 106)]; // rejection on its own already
      const entry = getEntrySignal(bullishSignal, candles, settings);

      expect(entry?.type).toBe("RETEST");
      expect(entry?.detectedAt).toBe(etTimestamp(11, 0));
    });

    test("after 11am, BREAKOUT_LEG Fibonacci anchors still see the true swing high/low across merged bars", () => {
      const breakoutLegSettings = { ...settings, fibonacciAnchorMode: "BREAKOUT_LEG" as const };
      // Swing high of 110 occurs in the first 5-min candle of a post-11am pair;
      // it must survive the merge into the 10-minute bar for the anchor calc.
      const candles = [
        candle(11, 0, 106, 110, 106, 109),
        candle(11, 5, 109, 109.2, 108.2, 108.4),
      ];

      const entry = getEntrySignal(bullishSignal, candles, breakoutLegSettings);
      expect(entry).not.toBeNull();
      expect(entry?.type).toBe("FIBONACCI");
    });
  });
});
