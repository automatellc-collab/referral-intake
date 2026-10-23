import { describe, expect, test } from "vitest";
import {
  calculateVWAP,
  calculateRSI,
  detectVwapReversion,
  detectGapFade,
  detectRsi2Reversion,
  detectOpeningVolumeSpike,
  detectMarubozu,
} from "@/lib/multi-strategy-signals";
import type { Candle } from "@/types/trading";

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    timestamp: 1000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    ...overrides,
  };
}

describe("calculateVWAP", () => {
  test("returns null for empty candles", () => {
    expect(calculateVWAP([])).toBeNull();
  });

  test("computes volume-weighted typical price across candles", () => {
    const candles = [
      makeCandle({ high: 102, low: 98, close: 100, volume: 100 }),
      makeCandle({ high: 106, low: 102, close: 104, volume: 300 }),
    ];
    const vwap = calculateVWAP(candles);
    // typical prices: 100, 104. weighted: (100*100 + 104*300)/400 = 103
    expect(vwap).toBeCloseTo(103, 5);
  });
});

describe("detectVwapReversion", () => {
  test("returns null when price is within the deviation threshold", () => {
    const candles = [makeCandle({ high: 100.1, low: 99.9, close: 100, volume: 1000 })];
    expect(detectVwapReversion(candles)).toBeNull();
  });

  test("flags BEARISH when price is stretched above VWAP", () => {
    const candles = [
      makeCandle({ high: 100, low: 100, close: 100, volume: 1000, timestamp: 1 }),
      makeCandle({ high: 102, low: 102, close: 102, volume: 1, timestamp: 2 }),
    ];
    const signal = detectVwapReversion(candles);
    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe("BEARISH");
    expect(signal?.strategy).toBe("VWAP_REVERSION");
  });

  test("flags BULLISH when price is stretched below VWAP", () => {
    const candles = [
      makeCandle({ high: 100, low: 100, close: 100, volume: 1000, timestamp: 1 }),
      makeCandle({ high: 98, low: 98, close: 98, volume: 1, timestamp: 2 }),
    ];
    const signal = detectVwapReversion(candles);
    expect(signal?.direction).toBe("BULLISH");
  });
});

describe("detectGapFade", () => {
  test("returns null for a gap under the threshold", () => {
    expect(detectGapFade(100.1, 100, 1000)).toBeNull();
  });

  test("fades BEARISH on a gap up", () => {
    const signal = detectGapFade(105, 100, 1000);
    expect(signal?.direction).toBe("BEARISH");
    expect(signal?.strategy).toBe("GAP_FILL_FADE");
  });

  test("fades BULLISH on a gap down", () => {
    const signal = detectGapFade(95, 100, 1000);
    expect(signal?.direction).toBe("BULLISH");
  });
});

describe("calculateRSI", () => {
  test("returns null when there isn't enough history", () => {
    expect(calculateRSI([makeCandle()], 2)).toBeNull();
  });

  test("returns 100 for an all-gains window", () => {
    const candles = [
      makeCandle({ close: 100, timestamp: 1 }),
      makeCandle({ close: 101, timestamp: 2 }),
      makeCandle({ close: 102, timestamp: 3 }),
    ];
    expect(calculateRSI(candles, 2)).toBe(100);
  });

  test("returns 0 for an all-losses window", () => {
    const candles = [
      makeCandle({ close: 102, timestamp: 1 }),
      makeCandle({ close: 101, timestamp: 2 }),
      makeCandle({ close: 100, timestamp: 3 }),
    ];
    expect(calculateRSI(candles, 2)).toBe(0);
  });
});

describe("detectRsi2Reversion", () => {
  test("flags BULLISH when RSI(2) is extremely oversold", () => {
    const candles = [
      makeCandle({ close: 102, timestamp: 1 }),
      makeCandle({ close: 101, timestamp: 2 }),
      makeCandle({ close: 100, timestamp: 3 }),
    ];
    const signal = detectRsi2Reversion(candles);
    expect(signal?.direction).toBe("BULLISH");
    expect(signal?.strategy).toBe("RSI2_REVERSION");
  });

  test("flags BEARISH when RSI(2) is extremely overbought", () => {
    const candles = [
      makeCandle({ close: 100, timestamp: 1 }),
      makeCandle({ close: 101, timestamp: 2 }),
      makeCandle({ close: 102, timestamp: 3 }),
    ];
    const signal = detectRsi2Reversion(candles);
    expect(signal?.direction).toBe("BEARISH");
  });

  test("returns null in the neutral zone", () => {
    const candles = [
      makeCandle({ close: 100, timestamp: 1 }),
      makeCandle({ close: 100.5, timestamp: 2 }),
      makeCandle({ close: 100.3, timestamp: 3 }),
    ];
    expect(detectRsi2Reversion(candles)).toBeNull();
  });
});

describe("detectOpeningVolumeSpike", () => {
  test("returns null when volume doesn't clear the spike multiple", () => {
    const candle = makeCandle({ open: 100, close: 101, volume: 1500 });
    expect(detectOpeningVolumeSpike(candle, 1000)).toBeNull();
  });

  test("flags BULLISH continuation on a volume spike with an up close", () => {
    const candle = makeCandle({ open: 100, close: 102, volume: 3000 });
    const signal = detectOpeningVolumeSpike(candle, 1000);
    expect(signal?.direction).toBe("BULLISH");
    expect(signal?.strategy).toBe("OPENING_VOLUME_SPIKE");
  });

  test("flags BEARISH continuation on a volume spike with a down close", () => {
    const candle = makeCandle({ open: 100, close: 98, volume: 3000 });
    const signal = detectOpeningVolumeSpike(candle, 1000);
    expect(signal?.direction).toBe("BEARISH");
  });

  test("returns null when average opening volume is zero or unknown", () => {
    const candle = makeCandle({ open: 100, close: 102, volume: 3000 });
    expect(detectOpeningVolumeSpike(candle, 0)).toBeNull();
  });
});

describe("detectMarubozu", () => {
  test("flags BULLISH on a candle with no wicks and a higher close", () => {
    const candle = makeCandle({ open: 100, high: 105, low: 100, close: 105 });
    const signal = detectMarubozu(candle);
    expect(signal?.direction).toBe("BULLISH");
    expect(signal?.strategy).toBe("MARUBOZU");
  });

  test("flags BEARISH on a candle with no wicks and a lower close", () => {
    const candle = makeCandle({ open: 105, high: 105, low: 100, close: 100 });
    const signal = detectMarubozu(candle);
    expect(signal?.direction).toBe("BEARISH");
  });

  test("still flags a near-marubozu with a negligible wick under the threshold", () => {
    // range 100 (0-100), lower wick 2 units (2%), well under the 5% cutoff
    const candle = makeCandle({ open: 2, high: 100, low: 0, close: 100 });
    const signal = detectMarubozu(candle);
    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe("BULLISH");
  });

  test("returns null when a wick exceeds the max-wick threshold", () => {
    // range 100 (0-100), body only 100-80=20 units with a large lower wick
    const candle = makeCandle({ open: 80, high: 100, low: 0, close: 100 });
    expect(detectMarubozu(candle)).toBeNull();
  });

  test("returns null for a doji (open equals close)", () => {
    const candle = makeCandle({ open: 100, high: 101, low: 99, close: 100 });
    expect(detectMarubozu(candle)).toBeNull();
  });

  test("returns null for a zero-range candle", () => {
    const candle = makeCandle({ open: 100, high: 100, low: 100, close: 100 });
    expect(detectMarubozu(candle)).toBeNull();
  });
});
