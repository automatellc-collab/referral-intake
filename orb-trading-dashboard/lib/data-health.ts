/**
 * Detects when the live data feed is stale or has a gap, rather than
 * silently treating incomplete data as "no signal yet". Built in response
 * to a real incident (2026-08-28): Twelve Data had a complete gap for the
 * entire 9:30-9:55 ET opening-range window while still returning success
 * responses, and the app had no way to distinguish "checked, no signal"
 * from "couldn't actually check."
 */
import { hasOpeningRangeClosed, isMarketOpen, isWithinOpeningRangeWindow } from "@/lib/market-hours";
import type { Candle } from "@/types/trading";

const STALE_THRESHOLD_MINUTES = 15;
const MIN_OPENING_RANGE_CANDLES = 2; // out of 3 expected 5-min bars (9:30, 9:35, 9:40) for the standard 15-min OR
const MIN_OPENING_RANGE_CANDLES_WIDE = 4; // out of 6 expected 5-min bars for a 30-min OR (e.g. QQQ)
const WIDE_OPENING_RANGE_SYMBOLS = new Set(["QQQ"]);

export interface DataHealth {
  isLive: boolean;
  staleSinceMinutes: number | null;
  openingRangeComplete: boolean;
}

export function assessDataHealth(candles: Candle[], now: number, symbol?: string): DataHealth {
  const marketOpen = isMarketOpen(now);
  const latestTimestamp = candles.length > 0 ? Math.max(...candles.map((c) => c.timestamp)) : null;

  let isLive = true;
  let staleSinceMinutes: number | null = null;

  if (marketOpen) {
    const minutesBehind = latestTimestamp === null ? Infinity : (now - latestTimestamp) / 60_000;
    if (minutesBehind > STALE_THRESHOLD_MINUTES) {
      isLive = false;
      staleSinceMinutes = Math.floor(minutesBehind);
    }
  }

  let openingRangeComplete = true;
  if (hasOpeningRangeClosed(now, symbol)) {
    const rangeCandleCount = candles.filter((c) => isWithinOpeningRangeWindow(c.timestamp, symbol)).length;
    const minCandles = symbol && WIDE_OPENING_RANGE_SYMBOLS.has(symbol)
      ? MIN_OPENING_RANGE_CANDLES_WIDE
      : MIN_OPENING_RANGE_CANDLES;
    openingRangeComplete = rangeCandleCount >= minCandles;
  }

  return { isLive, staleSinceMinutes, openingRangeComplete };
}
