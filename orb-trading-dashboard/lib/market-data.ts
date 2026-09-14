import { buildOpeningRange } from "@/lib/orb-strategy";
import { getEasternDateString, hasOpeningRangeClosed } from "@/lib/market-hours";
import { assessDataHealth, type DataHealth } from "@/lib/data-health";
import type { YahooFinanceClient, Quote } from "@/lib/market-data-client";
import type { Candle, OpeningRange } from "@/types/trading";

export interface SymbolSnapshot {
  symbol: string;
  quote: Quote;
  todayCandles: Candle[];
  openingRange: OpeningRange | null;
  dataHealth: DataHealth;
}

export async function getSymbolSnapshot(
  client: YahooFinanceClient,
  symbol: string,
): Promise<SymbolSnapshot> {
  // 5-minute candles. The source video says to watch the "1-minute
  // timeframe" for entries, but backtesting that literally (see
  // scripts/backtest-1min.ts) made this strategy's mechanical
  // rejection-candle rule perform meaningfully WORSE — 1-min bars are
  // noisy enough that the same rule picks up chop instead of real
  // reversals. 5-minute bars are what the validated win-rate numbers
  // are based on.
  const [quote, recentCandles] = await Promise.all([
    client.getQuote(symbol),
    client.getHistoricals(symbol, "5min", 100),
  ]);

  const now = Date.now();
  const today = getEasternDateString(now);
  const todayCandles = recentCandles.filter((c) => getEasternDateString(c.timestamp) === today);
  const dataHealth = assessDataHealth(todayCandles, now);

  // Don't treat the range as formed until (a) real wall-clock time has
  // actually passed 9:45 ET, and (b) the feed actually has enough of
  // today's opening-range candles to trust — a silent gap (real incident:
  // 2026-08-28, Twelve Data returned zero candles for 9:30-9:55 while
  // still reporting success) must never be allowed to look like "range
  // formed, no breakout yet." Those are different states.
  const openingRange =
    hasOpeningRangeClosed(now) && dataHealth.openingRangeComplete
      ? buildOpeningRange(symbol, today, todayCandles)
      : null;

  return { symbol, quote, todayCandles, openingRange, dataHealth };
}
