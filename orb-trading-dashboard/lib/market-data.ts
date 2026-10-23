import { buildOpeningRange, type BreakoutLevelContext } from "@/lib/orb-strategy";
import { getEasternDateString, getEasternMinutesOfDay, hasOpeningRangeClosed } from "@/lib/market-hours";
import { assessDataHealth, type DataHealth } from "@/lib/data-health";
import type { YahooFinanceClient, Quote } from "@/lib/market-data-client";
import type { Candle, OpeningRange } from "@/types/trading";

export interface SymbolSnapshot {
  symbol: string;
  quote: Quote;
  todayCandles: Candle[];
  openingRange: OpeningRange | null;
  dataHealth: DataHealth;
  levelContext: BreakoutLevelContext;
}

const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;

/** The prior trading day's regular-session high/low, from whatever extra
 * history getHistoricals returned beyond today — used by
 * PRIOR_DAY_ONLY_GATE_SYMBOLS in lib/orb-strategy.ts. Null when there isn't
 * a full prior RTH session in the fetched window (e.g. right after a data
 * gap) rather than silently treating "no prior day" as "breakout confirmed." */
function getPriorDayRthLevels(candles: Candle[], today: string): { high: number | null; low: number | null } {
  const priorDayCandles = candles.filter((c) => {
    const date = getEasternDateString(c.timestamp);
    if (date >= today) return false;
    const minutes = getEasternMinutesOfDay(c.timestamp);
    return minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES;
  });
  if (priorDayCandles.length === 0) return { high: null, low: null };

  const mostRecentDate = priorDayCandles.reduce(
    (max, c) => (getEasternDateString(c.timestamp) > max ? getEasternDateString(c.timestamp) : max),
    "",
  );
  const mostRecent = priorDayCandles.filter((c) => getEasternDateString(c.timestamp) === mostRecentDate);

  return {
    high: Math.max(...mostRecent.map((c) => c.high)),
    low: Math.min(...mostRecent.map((c) => c.low)),
  };
}

/** Today's premarket high/low — derived from todayCandles, which already
 * includes premarket bars (Yahoo's includePrePost=true) since a premarket
 * timestamp still carries today's Eastern calendar date. */
function getTodayPremarketLevels(todayCandles: Candle[]): { high: number | null; low: number | null } {
  const premarket = todayCandles.filter((c) => getEasternMinutesOfDay(c.timestamp) < MARKET_OPEN_MINUTES);
  if (premarket.length === 0) return { high: null, low: null };
  return {
    high: Math.max(...premarket.map((c) => c.high)),
    low: Math.min(...premarket.map((c) => c.low)),
  };
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
  // 250, not 100 — the extra history is needed to reliably capture the
  // PRIOR trading day's full regular session (for PRIOR_DAY_ONLY_GATE_SYMBOLS
  // in orb-strategy.ts), on top of today's own pre/regular/post bars.
  const [quote, recentCandles] = await Promise.all([
    client.getQuote(symbol),
    client.getHistoricals(symbol, "5min", 250),
  ]);

  const now = Date.now();
  const today = getEasternDateString(now);
  const todayCandles = recentCandles.filter((c) => getEasternDateString(c.timestamp) === today);
  const dataHealth = assessDataHealth(todayCandles, now, symbol);

  // Don't treat the range as formed until (a) real wall-clock time has
  // actually passed 9:45 ET, and (b) the feed actually has enough of
  // today's opening-range candles to trust — a silent gap (real incident:
  // 2026-08-28, Twelve Data returned zero candles for 9:30-9:55 while
  // still reporting success) must never be allowed to look like "range
  // formed, no breakout yet." Those are different states.
  const openingRange =
    hasOpeningRangeClosed(now, symbol) && dataHealth.openingRangeComplete
      ? buildOpeningRange(symbol, today, todayCandles)
      : null;

  const priorDay = getPriorDayRthLevels(recentCandles, today);
  const premarket = getTodayPremarketLevels(todayCandles);
  const levelContext: BreakoutLevelContext = {
    priorDayHigh: priorDay.high,
    priorDayLow: priorDay.low,
    premarketHigh: premarket.high,
    premarketLow: premarket.low,
  };

  return { symbol, quote, todayCandles, openingRange, dataHealth, levelContext };
}
