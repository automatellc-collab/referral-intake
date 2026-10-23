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
  const windowCandles = candles.filter((c) => isWithinOpeningRangeWindow(c.timestamp, symbol));

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

// High-quality-breakout filter (2026-09-28, exploratory): gates the ORB
// breakout itself on relative volume and intraday ATR, rather than trading
// every price-level cross regardless of how thin or noisy it is. Gated
// entirely behind `requireHighQualityBreakout` (default false) so it can
// never change the validated FIBONACCI_ONLY/RETEST_ONLY/ANY behavior unless
// explicitly turned on and backtested first — same convention as
// CONTINUATION_VOL_ONLY's requireVolumeConfirmation above.
//
// Both measures are computed from intraday 5-min candles (the only data this
// backtest/live pipeline fetches), not the textbook daily-bar ATR/RVOL — a
// deliberate simplification, not an attempt to reproduce a multi-day
// indicator with single-day data.
const ATR_LOOKBACK_CANDLES = 14;
const RELATIVE_VOLUME_LOOKBACK_CANDLES = 20;
const MIN_RELATIVE_VOLUME = 1.5;
const MIN_BREAKOUT_ATR_MULTIPLE = 0.25;

/** Average true range over the `period` candles immediately before `index`
 * (exclusive), using each candle's own high/low/prev-close range. Returns 0
 * if there isn't enough history yet. */
export function calculateIntradayATR(candles: Candle[], index: number, period = ATR_LOOKBACK_CANDLES): number {
  const start = Math.max(1, index - period);
  if (index - start < 1) return 0;

  let sum = 0;
  let count = 0;
  for (let i = start; i < index; i++) {
    const candle = candles[i];
    const prevClose = candles[i - 1].close;
    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
    sum += trueRange;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** The candle at `index`'s volume divided by the average volume of the
 * `lookback` candles immediately before it (exclusive). Returns 0 if there
 * isn't enough history yet, or the lookback average is 0. */
export function calculateRelativeVolume(
  candles: Candle[],
  index: number,
  lookback = RELATIVE_VOLUME_LOOKBACK_CANDLES,
): number {
  const start = Math.max(0, index - lookback);
  if (index - start < 1) return 0;

  const priorVolumes = candles.slice(start, index).map((c) => c.volume);
  const avgVolume = priorVolumes.reduce((a, b) => a + b, 0) / priorVolumes.length;
  if (avgVolume === 0) return 0;
  return candles[index].volume / avgVolume;
}

/** Requires the breakout candle to (a) trade on at least
 * MIN_RELATIVE_VOLUME× its recent average volume, and (b) clear the ORB
 * level by at least MIN_BREAKOUT_ATR_MULTIPLE× the recent intraday ATR —
 * filters out thin, low-conviction crosses that happen to tag the level on
 * light volume or by a fraction of a normal candle's range. */
export function isHighQualityBreakout(
  candles: Candle[],
  breakoutIndex: number,
  openingRange: OpeningRange,
  direction: ORBDirection,
): boolean {
  const relativeVolume = calculateRelativeVolume(candles, breakoutIndex);
  if (relativeVolume < MIN_RELATIVE_VOLUME) return false;

  const atr = calculateIntradayATR(candles, breakoutIndex);
  if (atr === 0) return false;

  const breakoutClose = candles[breakoutIndex].close;
  const clearance =
    direction === "BULLISH" ? breakoutClose - openingRange.high : openingRange.low - breakoutClose;
  return clearance >= atr * MIN_BREAKOUT_ATR_MULTIPLE;
}

// Per-symbol default for the quality gate, set from a full-year backtest
// comparison (2026-09-28, FIBONACCI_ONLY, EOD exit) rather than applied
// blanket — the filter helps most symbols but clearly hurts TSLA and COIN
// (their best moves get re-priced worse or skipped), so it's opt-in per
// ticker, not global:
//   SPY   50.7%->56.7% WR, +$227->+$754   (win)
//   QQQ   55.0%->50.8% WR, +$659->+$725   (P&L up, WR down — kept on)
//   CRWD  50.3%->50.6% WR, -$162->+$60    (flips positive)
//   NVDA  48.8%->54.8% WR, -$578->+$4     (flips ~breakeven)
//   AMD   45.5%->51.8% WR, -$570->+$450   (flips positive)
//   META  47.1%->49.7% WR, -$407->-$20    (much closer to breakeven)
//   AVGO  45.2%->45.4% WR, -$872->-$428   (less bad)
//   IWM   47.9%->54.5% WR, -$150->+$721   (flips positive)
//   MSTR  51.0%->60.2% WR, +$175->+$1,548 (big win)
// Left OFF (filter measurably hurt P&L despite sometimes raising WR):
//   TSLA  56.1%->55.0% WR, +$2,095->+$923 (clear loss)
//   COIN  49.7%->50.0% WR, +$1,188->+$91  (clear loss)
//   PLTR  51.6%->55.4% WR, +$162->+$28    (WR up, $ down)
//   LLY   49.1%->51.9% WR, +$773->+$337   (WR up, $ down)
const HIGH_QUALITY_BREAKOUT_SYMBOLS = new Set([
  "SPY", "QQQ", "CRWD", "NVDA", "AMD", "META", "AVGO", "IWM", "MSTR",
]);

/** Scans `dayCandles` (sorted, any point in the trading day) for the first
 * candle whose close breaks the opening range — and, for symbols in
 * HIGH_QUALITY_BREAKOUT_SYMBOLS (or when `settings.requireHighQualityBreakout`
 * is forced on as a manual override), keeps scanning past any breakout that
 * fails the relative-volume/ATR quality gate rather than accepting the first
 * price-level cross regardless of conviction. */
// Per-symbol gate (2026-09-29, full-year backtest against real Robinhood
// premarket data — see scripts/backtest-robinhood-premarket-real-rules.ts):
// a breakout that clears the PRIOR trading day's RTH high/low but does NOT
// also clear TODAY's actual premarket high/low ("prior-day-only") is a weak
// signal on its own, run through the real FIBONACCI/stop/target rules:
//   QQQ   35.0% WR, -$5.65/trade  (20 trades)
//   TSLA  25.0% WR, -$19.36/trade (4 trades)
//   COIN  25.0% WR, -$11.44/trade (8 trades)
//   CRWD  33.3% WR, -$10.58/trade (6 trades)
// SPY was the one exception (62.5% WR, +$9.37/trade) and is deliberately
// left off this gate. Small per-symbol sample sizes (4-20 trades) — this is
// a directionally-consistent pattern across 4/5 symbols, not a
// high-confidence backtest the way HIGH_QUALITY_BREAKOUT_SYMBOLS is.
// Requires premarket data, which backtest-engine.ts's Twelve Data candles
// don't carry — so this gate can only run against live premarket levels
// (BreakoutLevelContext), not be re-validated through the standard
// full-year grid-search scripts.
const PRIOR_DAY_ONLY_GATE_SYMBOLS = new Set(["QQQ", "TSLA", "COIN", "CRWD"]);

export interface BreakoutLevelContext {
  priorDayHigh: number | null;
  priorDayLow: number | null;
  premarketHigh: number | null;
  premarketLow: number | null;
}

function isPriorDayOnlyBreakout(
  breakoutPrice: number,
  direction: ORBDirection,
  context: BreakoutLevelContext,
): boolean {
  const beatsPriorDay =
    direction === "BULLISH"
      ? context.priorDayHigh !== null && breakoutPrice > context.priorDayHigh
      : context.priorDayLow !== null && breakoutPrice < context.priorDayLow;
  if (!beatsPriorDay) return false;

  const beatsPremarket =
    direction === "BULLISH"
      ? context.premarketHigh !== null && breakoutPrice > context.premarketHigh
      : context.premarketLow !== null && breakoutPrice < context.premarketLow;

  return !beatsPremarket;
}

export function findQualifyingBreakout(
  dayCandles: Candle[],
  openingRange: OpeningRange,
  settings: Pick<TradingSettings, "requireHighQualityBreakout">,
  levelContext?: BreakoutLevelContext,
): ORBSignal | null {
  const sorted = [...dayCandles].sort((a, b) => a.timestamp - b.timestamp);
  const applyQualityFilter =
    settings.requireHighQualityBreakout || HIGH_QUALITY_BREAKOUT_SYMBOLS.has(openingRange.symbol);
  const applyPriorDayGate = levelContext !== undefined && PRIOR_DAY_ONLY_GATE_SYMBOLS.has(openingRange.symbol);

  for (let i = 0; i < sorted.length; i++) {
    const candle = sorted[i];
    if (candle.timestamp <= openingRange.formedAt) continue;

    const signal = detectBreakout(openingRange, candle.close, candle.timestamp);
    if (!signal) continue;

    if (applyPriorDayGate && isPriorDayOnlyBreakout(signal.breakoutPrice, signal.direction, levelContext!)) {
      continue;
    }

    if (!applyQualityFilter || isHighQualityBreakout(sorted, i, openingRange, signal.direction)) {
      return signal;
    }
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

// The confirming candle's volume must clear this multiple of the pullback
// candle's volume to count as a genuine breakout, not thin-participation
// noise — same heuristic as the opening-volume-spike multi-strategy signal,
// applied here to the CONTINUATION_VOL_ONLY variant (2026-09-22).
const CONTINUATION_VOLUME_MULTIPLIER = 1.5;

// A pullback candle (goes against the breakout direction) immediately
// followed by a candle breaking that pullback's high/low — a shallow
// flag/continuation pattern. Exploratory (2026-09-22): backtested as
// CONTINUATION_ONLY (net-positive on every watchlist symbol, ~250
// trades/yr) and as CONTINUATION_VOL_ONLY with `requireVolumeConfirmation`
// to test whether gating on the confirm candle's volume tightens the edge.
// Gated entirely behind those two entryTypeFilter values so it can never
// fire under the validated FIBONACCI_ONLY/RETEST_ONLY/ANY configs.
function findContinuationEntry(
  postBreakoutCandles: Candle[],
  direction: ORBDirection,
  requireVolumeConfirmation: boolean,
): { pullback: Candle; confirm: Candle } | null {
  for (let i = 0; i < postBreakoutCandles.length - 1; i++) {
    const pullback = postBreakoutCandles[i];
    const confirm = postBreakoutCandles[i + 1];

    const isPullbackCandle =
      direction === "BULLISH" ? pullback.close < pullback.open : pullback.close > pullback.open;
    if (!isPullbackCandle) continue;

    const confirms =
      direction === "BULLISH" ? confirm.high > pullback.high : confirm.low < pullback.low;
    if (!confirms) continue;

    if (requireVolumeConfirmation && confirm.volume < pullback.volume * CONTINUATION_VOLUME_MULTIPLIER) {
      continue;
    }

    return { pullback, confirm };
  }
  return null;
}

// FLAG_MIN/MAX_CANDLES bound how many consolidation bars count as a flag.
// FLAG_TIGHTNESS_RATIO caps each flag candle's range against the flagpole
// (the breakout candle itself) — the tighter the consolidation, the more
// convincing the pause before continuation. Exploratory (2026-09-23):
// generalizes CONTINUATION's single pullback candle into a proper
// multi-candle flag, confirmed only once price actually breaks the flag's
// high/low in the trend direction (not entered on the consolidation itself).
const FLAG_MIN_CANDLES = 2;
const FLAG_MAX_CANDLES = 5;
const FLAG_TIGHTNESS_RATIO = 0.6;

function findFlagEntry(
  postBreakoutCandles: Candle[],
  direction: ORBDirection,
): { flagCandles: Candle[]; confirm: Candle } | null {
  if (postBreakoutCandles.length < 2) return null;
  const flagpole = postBreakoutCandles[0];
  const poleRange = flagpole.high - flagpole.low;
  if (poleRange === 0) return null;

  for (let start = 1; start < postBreakoutCandles.length; start++) {
    for (let len = FLAG_MIN_CANDLES; len <= FLAG_MAX_CANDLES; len++) {
      const flagCandles = postBreakoutCandles.slice(start, start + len);
      if (flagCandles.length < len) break;

      const isTight = flagCandles.every((c) => c.high - c.low <= poleRange * FLAG_TIGHTNESS_RATIO);
      if (!isTight) continue;

      const flagHigh = Math.max(...flagCandles.map((c) => c.high));
      const flagLow = Math.min(...flagCandles.map((c) => c.low));
      const confirm = postBreakoutCandles[start + len];
      if (!confirm) continue;

      const confirms = direction === "BULLISH" ? confirm.close > flagHigh : confirm.close < flagLow;
      if (confirms) return { flagCandles, confirm };
    }
  }
  return null;
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
// 5-minute candles. When enabled and after 11am ET, midday chop makes single
// 5-minute bars noisy — switch to 10-minute bars (merging consecutive 5-minute
// candles) for the rest of the signal-detection window, per the video's approach.
function applyElevenAmTimeframeSwitch(candles: Candle[], enabled: boolean): Candle[] {
  if (!enabled) {
    return candles;
  }

  const before = candles.filter((c) => !isAfterElevenAm(c.timestamp));
  const after = candles.filter((c) => isAfterElevenAm(c.timestamp));

  if (after.length === 0) {
    return candles;
  }

  return [...before, ...aggregateCandles(after, TEN_MINUTE_BUCKET_MS)];
}

export function getFibonacciAnchors(
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
  const candles = applyElevenAmTimeframeSwitch(candlesSinceBreakout, settings.useElevenAmSwitch);

  // A retest/rejection means price came BACK to the level after breaking
  // out — the breakout candle's own wick touching that level is normal
  // same-bar noise, not a retest. Exclude it so this doesn't trivially
  // trigger on every breakout.
  const postBreakoutCandles = candles.filter((c) => c.timestamp > signal.breakoutAt);
  if (postBreakoutCandles.length === 0) {
    return null;
  }

  const lastCandle = postBreakoutCandles[postBreakoutCandles.length - 1];
  const allowRetest =
    settings.entryTypeFilter === "ANY" || settings.entryTypeFilter === "RETEST_ONLY";
  const allowFibonacci =
    settings.entryTypeFilter === "ANY" || settings.entryTypeFilter === "FIBONACCI_ONLY";
  const allowFibonacciConfirmed = settings.entryTypeFilter === "FIBONACCI_CONFIRMED_ONLY";
  const allowContinuation =
    settings.entryTypeFilter === "CONTINUATION_ONLY" ||
    settings.entryTypeFilter === "CONTINUATION_VOL_ONLY";
  const allowFlag = settings.entryTypeFilter === "FLAG_ONLY";

  if (allowFlag) {
    const found = findFlagEntry(postBreakoutCandles, direction);
    if (found) {
      return buildEntry("FLAG", signal, found.confirm.close, found.confirm.timestamp, settings);
    }
    return null;
  }

  if (allowContinuation) {
    const requireVolumeConfirmation = settings.entryTypeFilter === "CONTINUATION_VOL_ONLY";
    const found = findContinuationEntry(postBreakoutCandles, direction, requireVolumeConfirmation);
    if (found) {
      const { pullback, confirm } = found;
      const triggerPrice = direction === "BULLISH" ? pullback.high : pullback.low;
      return buildEntry("CONTINUATION", signal, triggerPrice, confirm.timestamp, settings);
    }
    return null;
  }

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

  if (!allowFibonacci && !allowFibonacciConfirmed) {
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

  // Sticky, like the RETEST check above: scan every post-breakout candle's
  // close for the first one that fell in the Fibonacci zone, not just
  // whatever candle is newest on this poll. Checking only lastCandle.close
  // meant a candle that closed in the zone got silently "superseded" by
  // the next candle closing outside it before the next 2-min poll ever
  // saw it — live polling only observes the latest candle, but the
  // backtest engine that validated this edge (~210 trades/yr on SPY,
  // 62% WR) walks every candle sequentially and never misses one. Root
  // caused 2026-09-22 after a signal-free morning against that backtest.
  const fibCandleIndex = postBreakoutCandles.findIndex((c) =>
    isPriceInFibonacciZone(c.close, fibLevels, direction),
  );
  const fibCandle = fibCandleIndex === -1 ? undefined : postBreakoutCandles[fibCandleIndex];
  if (!fibCandle) {
    return null;
  }

  if (allowFibonacciConfirmed) {
    // Require the candle AFTER the zone-touch to close back in the trend
    // direction, past the zone boundary it touched — confirms the pullback
    // is resuming, not still reversing. Exploratory (2026-09-23): raised
    // after a run of live FIBONACCI entries that touched the zone and kept
    // going against the trade instead of bouncing.
    const confirmCandle = postBreakoutCandles[fibCandleIndex + 1];
    if (!confirmCandle) {
      return null;
    }
    // level236 is always the boundary nearer the breakout extreme (the
    // "shallow" edge of the zone) regardless of direction — see fibonacci.ts.
    const zoneBoundary = fibLevels.level236;
    const confirmed =
      direction === "BULLISH" ? confirmCandle.close > zoneBoundary : confirmCandle.close < zoneBoundary;
    if (!confirmed) {
      return null;
    }
    return buildEntry("FIBONACCI", signal, confirmCandle.close, confirmCandle.timestamp, settings);
  }

  return buildEntry("FIBONACCI", signal, fibCandle.close, fibCandle.timestamp, settings);
}
