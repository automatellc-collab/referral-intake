import { aggregateCandles } from "@/lib/candle-aggregation";
import { calculateFibonacciLevels, isPriceInFibonacciZone } from "@/lib/fibonacci";
import { isAfterElevenAm, isWithinOpeningRangeWindow } from "@/lib/market-hours";
import type {
  Candle,
  EntrySignal,
  ORBDirection,
  ORBSignal,
  OpeningRange,
  TradingSettings,
} from "@/types/trading";

export function buildOpeningRange(
  symbol: string,
  date: string,
  candles: Candle[],
): OpeningRange | null {
  const windowCandles = candles.filter((c) => isWithinOpeningRangeWindow(c.timestamp));

  if (windowCandles.length === 0) {
    return null;
  }

  const high = Math.max(...windowCandles.map((c) => c.high));
  const low = Math.min(...windowCandles.map((c) => c.low));
  const formedAt = windowCandles[windowCandles.length - 1].timestamp;

  // Validate opening range: HIGH must be > LOW
  if (high <= low) {
    console.warn(
      `[ORB] Invalid opening range for ${symbol}: HIGH (${high}) <= LOW (${low}). Rejecting.`,
    );
    return null;
  }

  // Log the opening range for debugging
  console.log(
    `[ORB] ${symbol} opening range: HIGH ${high.toFixed(2)}, LOW ${low.toFixed(2)}, ` +
      `${windowCandles.length} candles in 9:30-9:45 window`,
  );

  return { symbol, date, high, low, formedAt };
}

export function detectBreakout(
  openingRange: OpeningRange,
  latestPrice: number,
  timestamp: number,
): ORBSignal | null {
  if (latestPrice > openingRange.high) {
    return {
      symbol: openingRange.symbol,
      direction: "BULLISH",
      openingRange,
      breakoutPrice: latestPrice,
      breakoutAt: timestamp,
    };
  }

  if (latestPrice < openingRange.low) {
    return {
      symbol: openingRange.symbol,
      direction: "BEARISH",
      openingRange,
      breakoutPrice: latestPrice,
      breakoutAt: timestamp,
    };
  }

  return null;
}

function isRejectionCandle(
  candle: Candle,
  direction: ORBDirection,
  openingRange: OpeningRange,
): boolean {
  if (direction === "BULLISH") {
    // Price dips down to (or through) the ORB high, then closes back above it.
    return candle.low <= openingRange.high && candle.close > openingRange.high;
  }

  // Price pushes up to (or through) the ORB low, then closes back below it.
  return candle.high >= openingRange.low && candle.close < openingRange.low;
}

function buildEntry(
  type: EntrySignal["type"],
  signal: ORBSignal,
  price: number,
  detectedAt: number,
  settings: TradingSettings,
): EntrySignal {
  const direction = signal.direction;
  const stopLoss = direction === "BULLISH" ? signal.openingRange.low : signal.openingRange.high;
  const riskPerShare = Math.abs(price - stopLoss);
  const takeProfit =
    direction === "BULLISH"
      ? price + riskPerShare * settings.riskRewardRatio
      : price - riskPerShare * settings.riskRewardRatio;

  return {
    type,
    symbol: signal.symbol,
    direction,
    price,
    stopLoss,
    takeProfit,
    riskRewardRatio: settings.riskRewardRatio,
    detectedAt,
  };
}

const TEN_MINUTE_BUCKET_MS = 10 * 60 * 1000;

// The opening range and the 9:45-11:00 monitoring window run on the native
// 5-minute candles. After 11am ET, midday chop makes single 5-minute bars
// noisy — switch to 10-minute bars (merging consecutive 5-minute candles) for
// the rest of the signal-detection window, per the video's original approach.
function applyElevenAmTimeframeSwitch(candles: Candle[]): Candle[] {
  const before = candles.filter((c) => !isAfterElevenAm(c.timestamp));
  const after = candles.filter((c) => isAfterElevenAm(c.timestamp));

  if (after.length === 0) {
    return candles;
  }

  return [...before, ...aggregateCandles(after, TEN_MINUTE_BUCKET_MS)];
}

function getFibonacciAnchors(
  signal: ORBSignal,
  candlesSinceBreakout: Candle[],
  mode: TradingSettings["fibonacciAnchorMode"],
): { low: number; high: number } {
  const { openingRange, direction } = signal;

  if (mode === "BREAKOUT_LEG") {
    if (direction === "BULLISH") {
      const swingHigh = Math.max(...candlesSinceBreakout.map((c) => c.high));
      return { low: openingRange.high, high: swingHigh };
    }
    const swingLow = Math.min(...candlesSinceBreakout.map((c) => c.low));
    return { low: swingLow, high: openingRange.low };
  }

  // OPENING_RANGE (default): retrace the fixed 9:30-9:45 range itself.
  return { low: openingRange.low, high: openingRange.high };
}

export function getEntrySignal(
  signal: ORBSignal,
  candlesSinceBreakout: Candle[],
  settings: TradingSettings,
): EntrySignal | null {
  const { openingRange, direction } = signal;
  const candles = applyElevenAmTimeframeSwitch(candlesSinceBreakout);

  // A retest/rejection means price came BACK to the level after breaking
  // out — the breakout candle's own wick touching that level is normal
  // same-bar noise, not a retest. Exclude it so this doesn't trivially
  // trigger on every breakout.
  const postBreakoutCandles = candles.filter((c) => c.timestamp > signal.breakoutAt);
  if (postBreakoutCandles.length === 0) {
    return null;
  }

  const lastCandle = postBreakoutCandles[postBreakoutCandles.length - 1];
  const allowRetest = settings.entryTypeFilter !== "FIBONACCI_ONLY";
  const allowFibonacci = settings.entryTypeFilter !== "RETEST_ONLY";

  if (allowRetest) {
    // Use the candle that ACTUALLY satisfied the rejection test, not
    // whatever candle is newest — a RETEST signal stays "active" for the
    // rest of the day once triggered (the check below is effectively
    // sticky), so re-pricing it off lastCandle.close on every poll would
    // silently drift the displayed entry price/time away from the real
    // trigger the longer the trade develops. Real incident (2026-08-31):
    // a live signal drifted ~$1 from its true trigger price between polls.
    const rejectionCandle = postBreakoutCandles.find((c) =>
      isRejectionCandle(c, direction, openingRange),
    );
    if (rejectionCandle) {
      return buildEntry("RETEST", signal, rejectionCandle.close, rejectionCandle.timestamp, settings);
    }
  }

  if (!allowFibonacci) {
    return null;
  }

  // No clean retest of the ORB level occurred — check whether price has
  // instead retraced into the 0.236-0.382 Fibonacci zone, per the video's
  // guidance for strong trends that don't come back to retest. The two
  // anchor points for that retracement are configurable — see
  // FibonacciAnchorMode in types/trading.ts. Unlike the retest scan, the
  // swing high/low DOES include the breakout candle — its high/low is a
  // real price the move reached, relevant to measuring the leg's extent.
  const anchors = getFibonacciAnchors(signal, candles, settings.fibonacciAnchorMode);
  if (anchors.low >= anchors.high) {
    return null; // swing hasn't developed enough to define a meaningful zone yet
  }

  const fibLevels = calculateFibonacciLevels(anchors.low, anchors.high, direction);

  if (isPriceInFibonacciZone(lastCandle.close, fibLevels, direction)) {
    return buildEntry("FIBONACCI", signal, lastCandle.close, lastCandle.timestamp, settings);
  }

  return null;
}
