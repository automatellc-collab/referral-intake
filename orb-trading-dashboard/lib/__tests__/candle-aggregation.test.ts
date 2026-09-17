import { describe, expect, test } from "vitest";
import { aggregateCandles } from "@/lib/candle-aggregation";
import type { Candle } from "@/types/trading";

function etTimestamp(hour: number, minute: number): number {
  // 2026-08-26 is a Wednesday (regular trading day); EDT (summer) is UTC-4.
  return Date.UTC(2026, 7, 26, hour + 4, minute, 0);
}

function candle(hour: number, minute: number, o: number, h: number, l: number, c: number, v = 1000): Candle {
  return { timestamp: etTimestamp(hour, minute), open: o, high: h, low: l, close: c, volume: v };
}

const TEN_MIN_MS = 10 * 60 * 1000;

describe("aggregateCandles", () => {
  test("merges two consecutive 5-minute candles into one 10-minute bar", () => {
    const candles = [
      candle(11, 0, 100, 102, 99, 101, 500),
      candle(11, 5, 101, 103, 100, 102, 700),
    ];

    const result = aggregateCandles(candles, TEN_MIN_MS);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      timestamp: etTimestamp(11, 0),
      open: 100, // first candle's open
      high: 103, // max of both highs
      low: 99, // min of both lows
      close: 102, // last candle's close
      volume: 1200, // summed
    });
  });

  test("splits candles spanning a 10-minute boundary into separate bars", () => {
    const candles = [
      candle(11, 0, 100, 102, 99, 101),
      candle(11, 5, 101, 103, 100, 102),
      candle(11, 10, 102, 104, 101, 103), // new 10-minute bucket
    ];

    const result = aggregateCandles(candles, TEN_MIN_MS);

    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe(etTimestamp(11, 0));
    expect(result[1].timestamp).toBe(etTimestamp(11, 10));
    expect(result[1].close).toBe(103);
  });

  test("leaves a lone candle (a still-forming bar) as its own single-candle bucket", () => {
    const candles = [candle(11, 0, 100, 102, 99, 101)];
    const result = aggregateCandles(candles, TEN_MIN_MS);

    expect(result).toEqual(candles);
  });

  test("returns an empty array for an empty input", () => {
    expect(aggregateCandles([], TEN_MIN_MS)).toEqual([]);
  });

  test("handles out-of-order candles by sorting within each bucket before merging", () => {
    const first = candle(11, 0, 100, 102, 99, 101);
    const second = candle(11, 5, 101, 103, 100, 102);
    const result = aggregateCandles([second, first], TEN_MIN_MS);

    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(first.open);
    expect(result[0].close).toBe(second.close);
  });
});
