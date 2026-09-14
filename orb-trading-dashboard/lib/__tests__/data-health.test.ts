import { describe, expect, test } from "vitest";
import { assessDataHealth } from "@/lib/data-health";
import type { Candle } from "@/types/trading";

// 2026-08-28 is a Thursday-equivalent trading day; EDT = UTC-4.
function etTimestamp(hour: number, minute: number): number {
  return Date.UTC(2026, 7, 28, hour + 4, minute, 0);
}

function candle(hour: number, minute: number): Candle {
  return { timestamp: etTimestamp(hour, minute), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
}

describe("assessDataHealth", () => {
  test("reports live when the latest candle is recent and market is open", () => {
    const now = etTimestamp(10, 5);
    const candles = [candle(9, 55), candle(10, 0)];
    const health = assessDataHealth(candles, now);
    expect(health.isLive).toBe(true);
    expect(health.staleSinceMinutes).toBeNull();
  });

  test("reports stale when the latest candle is far behind and market is open", () => {
    const now = etTimestamp(10, 20);
    const candles = [candle(9, 45), candle(9, 55)]; // last candle 25 min behind now
    const health = assessDataHealth(candles, now);
    expect(health.isLive).toBe(false);
    expect(health.staleSinceMinutes).toBeGreaterThanOrEqual(20);
  });

  test("does not flag staleness outside market hours", () => {
    const now = etTimestamp(20, 0); // 8pm ET, market closed
    const candles = [candle(15, 55)]; // last real candle from hours ago
    const health = assessDataHealth(candles, now);
    expect(health.isLive).toBe(true);
    expect(health.staleSinceMinutes).toBeNull();
  });

  test("does not flag an incomplete opening range before the range has closed", () => {
    const now = etTimestamp(9, 35); // range still forming
    const candles = [candle(9, 30)];
    const health = assessDataHealth(candles, now);
    expect(health.openingRangeComplete).toBe(true);
  });

  test("flags an incomplete opening range once the range has closed but candles are missing", () => {
    const now = etTimestamp(9, 50);
    const candles: Candle[] = []; // exactly today's real incident: zero candles for 9:30-9:45
    const health = assessDataHealth(candles, now);
    expect(health.openingRangeComplete).toBe(false);
  });

  test("reports a complete opening range once enough candles are present", () => {
    const now = etTimestamp(9, 50);
    const candles = [candle(9, 30), candle(9, 35), candle(9, 40)];
    const health = assessDataHealth(candles, now);
    expect(health.openingRangeComplete).toBe(true);
  });
});
