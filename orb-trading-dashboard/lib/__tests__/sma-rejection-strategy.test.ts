import { describe, expect, test } from "vitest";
import { calculateSMA, detectSMARejection } from "@/lib/sma-rejection-strategy";
import type { Candle } from "@/types/trading";

function etTimestamp(hour: number, minute: number): number {
  return Date.UTC(2026, 7, 26, hour + 4, minute, 0);
}

function candle(hour: number, minute: number, o: number, h: number, l: number, c: number): Candle {
  return { timestamp: etTimestamp(hour, minute), open: o, high: h, low: l, close: c, volume: 1000 };
}

describe("calculateSMA", () => {
  test("averages the last N daily closes, ignoring older ones", () => {
    const closes = [...Array(199).fill(100), 300]; // 199 old values + 1 recent, period 200
    expect(calculateSMA(closes, 200)).toBeCloseTo((199 * 100 + 300) / 200);
  });

  test("uses only the most recent `period` closes when more are supplied", () => {
    const closes = [9999, ...Array(200).fill(50)]; // an extra old value the SMA should ignore
    expect(calculateSMA(closes, 200)).toBe(50);
  });

  test("throws when there aren't enough closes for the requested period", () => {
    expect(() => calculateSMA([100, 101, 102], 200)).toThrow(/at least 200/i);
  });
});

describe("detectSMARejection", () => {
  const sma = 200;

  test("BEARISH rejection: price approaches from below, wicks above the SMA, closes back below it", () => {
    const c = candle(10, 5, 198, 201, 197.5, 199); // open<sma, high>=sma, close<sma
    const signal = detectSMARejection(c, sma);

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe("BEARISH");
    expect(signal?.price).toBe(199);
    expect(signal?.stopLoss).toBe(201); // the wick high — invalidation point
    expect(signal?.smaLevel).toBe(200);
    expect(signal?.takeProfit).toBeLessThan(signal!.price);
    // 3:1 R:R: risk = 201-199 = 2, reward = 6 -> target = 199-6 = 193
    expect(signal?.takeProfit).toBeCloseTo(193);
  });

  test("BULLISH rejection: price approaches from above, wicks below the SMA, closes back above it", () => {
    const c = candle(10, 5, 202, 202.5, 199, 201); // open>sma, low<=sma, close>sma
    const signal = detectSMARejection(c, sma);

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe("BULLISH");
    expect(signal?.price).toBe(201);
    expect(signal?.stopLoss).toBe(199); // the wick low — invalidation point
    expect(signal?.takeProfit).toBeGreaterThan(signal!.price);
    // risk = 201-199 = 2, reward = 6 -> target = 201+6 = 207
    expect(signal?.takeProfit).toBeCloseTo(207);
  });

  test("returns null when price breaks cleanly through the level instead of rejecting", () => {
    const c = candle(10, 5, 198, 203, 197.5, 202); // opened below, closed above — a real break, not a rejection
    expect(detectSMARejection(c, sma)).toBeNull();
  });

  test("returns null when the candle never reaches the SMA level at all", () => {
    const c = candle(10, 5, 190, 192, 189, 191); // nowhere near 200
    expect(detectSMARejection(c, sma)).toBeNull();
  });

  test("returns null when the candle opens exactly at the level (no clear approach side)", () => {
    const c = candle(10, 5, 200, 201, 199, 200.5);
    expect(detectSMARejection(c, sma)).toBeNull();
  });
});
