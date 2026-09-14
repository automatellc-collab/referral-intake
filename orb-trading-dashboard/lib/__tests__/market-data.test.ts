import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getSymbolSnapshot } from "@/lib/market-data";
import type { Candle } from "@/types/trading";

function etTimestamp(hour: number, minute: number): number {
  return Date.UTC(2026, 7, 27, hour + 4, minute, 0); // 2026-08-27, EDT = UTC-4
}

function candle(hour: number, minute: number, o: number, h: number, l: number, c: number): Candle {
  return { timestamp: etTimestamp(hour, minute), open: o, high: h, low: l, close: c, volume: 1000 };
}

const todayCandles: Candle[] = [
  candle(9, 30, 100, 102, 99, 101),
  candle(9, 35, 101, 104, 100, 103),
  candle(9, 40, 103, 105, 102, 104),
];

function fakeClient(candles: Candle[]) {
  return {
    getQuote: vi.fn().mockResolvedValue({ symbol: "SPY", price: 104, timestamp: Date.now() }),
    getHistoricals: vi.fn().mockResolvedValue(candles),
  } as any;
}

describe("getSymbolSnapshot", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not report an opening range before 9:45 ET, even if partial candles exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(etTimestamp(9, 38)); // mid-formation, before the 9:45 cutoff

    const snapshot = await getSymbolSnapshot(fakeClient(todayCandles), "SPY");

    expect(snapshot.openingRange).toBeNull();
  });

  test("reports the opening range once real time has passed 9:45 ET", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(etTimestamp(9, 50));

    const snapshot = await getSymbolSnapshot(fakeClient(todayCandles), "SPY");

    expect(snapshot.openingRange).not.toBeNull();
    expect(snapshot.openingRange?.high).toBe(105);
    expect(snapshot.openingRange?.low).toBe(99);
    expect(snapshot.dataHealth.openingRangeComplete).toBe(true);
  });

  test("does not report an opening range when the feed has a data gap, even after 9:45 ET (real incident: 2026-08-28)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(etTimestamp(9, 50));

    // Feed returns zero candles for today's opening range window — the
    // actual failure mode observed against Twelve Data.
    const snapshot = await getSymbolSnapshot(fakeClient([]), "SPY");

    expect(snapshot.openingRange).toBeNull();
    expect(snapshot.dataHealth.openingRangeComplete).toBe(false);
  });
});
