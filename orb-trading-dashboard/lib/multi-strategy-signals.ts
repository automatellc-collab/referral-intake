// Four additional intraday signal detectors, requested alongside ORB and the
// SMA-200 rejection strategy. NONE of these have been backtested against
// real historical data yet — unlike ORB and SMA-rejection, which earned
// their "worth trading" status through an actual A/B backtest. Treat every
// signal from this module as informational until it goes through the same
// validation. The recommended hold times below are drawn from the published
// research each strategy is based on, not from anything measured here.
import type { Candle, ORBDirection } from "@/types/trading";

export type MultiStrategyName =
  | "VWAP_REVERSION"
  | "GAP_FILL_FADE"
  | "RSI2_REVERSION"
  | "OPENING_VOLUME_SPIKE"
  | "MARUBOZU";

export interface MultiStrategySignal {
  strategy: MultiStrategyName;
  direction: ORBDirection;
  price: number;
  timestamp: number;
  reason: string;
  /** Typical hold time from the published research this strategy is based
   * on — a starting point, not a backtested optimum for this account. */
  recommendedHoldMinutes: number;
}

// --- VWAP mean-reversion ---------------------------------------------------

// Deviation from VWAP beyond this, intraday, is the entry trigger. 0.5% is
// a commonly cited starting threshold in VWAP-reversion literature — tight
// enough to catch real stretches, loose enough to avoid noise on a 5-min bar.
const VWAP_DEVIATION_THRESHOLD_PCT = 0.5;
const VWAP_REVERSION_HOLD_MINUTES = 25;

export function calculateVWAP(candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
  }
  if (cumulativeVolume === 0) return null;
  return cumulativePV / cumulativeVolume;
}

export function detectVwapReversion(
  candlesSinceOpen: Candle[],
): MultiStrategySignal | null {
  if (candlesSinceOpen.length === 0) return null;
  const vwap = calculateVWAP(candlesSinceOpen);
  if (vwap === null || vwap === 0) return null;

  const lastCandle = candlesSinceOpen[candlesSinceOpen.length - 1];
  const deviationPct = ((lastCandle.close - vwap) / vwap) * 100;

  if (deviationPct > VWAP_DEVIATION_THRESHOLD_PCT) {
    // Stretched above VWAP — expect a pullback back toward it.
    return {
      strategy: "VWAP_REVERSION",
      direction: "BEARISH",
      price: lastCandle.close,
      timestamp: lastCandle.timestamp,
      reason: `Price ${deviationPct.toFixed(2)}% above VWAP ($${vwap.toFixed(2)}) — expecting reversion back toward it`,
      recommendedHoldMinutes: VWAP_REVERSION_HOLD_MINUTES,
    };
  }

  if (deviationPct < -VWAP_DEVIATION_THRESHOLD_PCT) {
    return {
      strategy: "VWAP_REVERSION",
      direction: "BULLISH",
      price: lastCandle.close,
      timestamp: lastCandle.timestamp,
      reason: `Price ${Math.abs(deviationPct).toFixed(2)}% below VWAP ($${vwap.toFixed(2)}) — expecting a bounce back toward it`,
      recommendedHoldMinutes: VWAP_REVERSION_HOLD_MINUTES,
    };
  }

  return null;
}

// --- Gap-fill fade ----------------------------------------------------------

// A gap under this size is normal noise, not a real gap worth fading.
const GAP_THRESHOLD_PCT = 0.3;
const GAP_FADE_HOLD_MINUTES = 90;

export function detectGapFade(
  openPrice: number,
  previousClose: number,
  timestamp: number,
): MultiStrategySignal | null {
  if (previousClose === 0) return null;
  const gapPct = ((openPrice - previousClose) / previousClose) * 100;

  if (Math.abs(gapPct) < GAP_THRESHOLD_PCT) return null;

  // Gapped up -> fade is bearish (expect partial fill back down).
  // Gapped down -> fade is bullish (expect partial fill back up).
  const direction: ORBDirection = gapPct > 0 ? "BEARISH" : "BULLISH";

  return {
    strategy: "GAP_FILL_FADE",
    direction,
    price: openPrice,
    timestamp,
    reason: `Gapped ${gapPct > 0 ? "up" : "down"} ${Math.abs(gapPct).toFixed(2)}% from prior close ($${previousClose.toFixed(2)}) — fading toward a partial gap fill. Verify this isn't gapping on real news (earnings, guidance) before trading it — a news-driven gap does not reliably fill.`,
    recommendedHoldMinutes: GAP_FADE_HOLD_MINUTES,
  };
}

// --- RSI(2) mean reversion (Connors) ---------------------------------------

// Connors' published thresholds: RSI(2) below 10 is extremely oversold,
// above 90 is extremely overbought. Applied here to 5-min bars as an
// intraday adaptation of the original daily-bar research.
const RSI2_OVERSOLD_THRESHOLD = 10;
const RSI2_OVERBOUGHT_THRESHOLD = 90;
const RSI2_PERIOD = 2;
const RSI2_REVERSION_HOLD_MINUTES = 45;

export function calculateRSI(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const recent = candles.slice(-(period + 1));

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const change = recent[i].close - recent[i - 1].close;
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function detectRsi2Reversion(
  candlesSinceOpen: Candle[],
): MultiStrategySignal | null {
  const rsi = calculateRSI(candlesSinceOpen, RSI2_PERIOD);
  if (rsi === null) return null;

  const lastCandle = candlesSinceOpen[candlesSinceOpen.length - 1];

  if (rsi <= RSI2_OVERSOLD_THRESHOLD) {
    return {
      strategy: "RSI2_REVERSION",
      direction: "BULLISH",
      price: lastCandle.close,
      timestamp: lastCandle.timestamp,
      reason: `RSI(2) at ${rsi.toFixed(1)} — extremely oversold, expecting a bounce`,
      recommendedHoldMinutes: RSI2_REVERSION_HOLD_MINUTES,
    };
  }

  if (rsi >= RSI2_OVERBOUGHT_THRESHOLD) {
    return {
      strategy: "RSI2_REVERSION",
      direction: "BEARISH",
      price: lastCandle.close,
      timestamp: lastCandle.timestamp,
      reason: `RSI(2) at ${rsi.toFixed(1)} — extremely overbought, expecting a pullback`,
      recommendedHoldMinutes: RSI2_REVERSION_HOLD_MINUTES,
    };
  }

  return null;
}

// --- Opening volume-spike continuation --------------------------------------

// The opening 5-min candle's volume needs to clear this multiple of the
// recent average to count as a genuine spike, not routine open-of-day flow.
const VOLUME_SPIKE_MULTIPLIER = 2;
// Matches ORB's own backtested finding: momentum from a strong open tends to
// fade after ~40 minutes, not because this has been separately validated.
const VOLUME_SPIKE_HOLD_MINUTES = 40;

export function detectOpeningVolumeSpike(
  openingCandle: Candle,
  averageOpeningVolume: number,
): MultiStrategySignal | null {
  if (averageOpeningVolume <= 0) return null;
  if (openingCandle.volume < averageOpeningVolume * VOLUME_SPIKE_MULTIPLIER) return null;
  if (openingCandle.close === openingCandle.open) return null;

  const direction: ORBDirection = openingCandle.close > openingCandle.open ? "BULLISH" : "BEARISH";
  const volumeMultiple = openingCandle.volume / averageOpeningVolume;

  return {
    strategy: "OPENING_VOLUME_SPIKE",
    direction,
    price: openingCandle.close,
    timestamp: openingCandle.timestamp,
    reason: `Opening candle volume ${volumeMultiple.toFixed(1)}x the recent average, closed ${direction === "BULLISH" ? "up" : "down"} — expecting continuation`,
    recommendedHoldMinutes: VOLUME_SPIKE_HOLD_MINUTES,
  };
}

// --- Marubozu continuation ---------------------------------------------------

// A candle with (near-)no wick on either side — the body spans nearly the
// whole high-low range — signals one-sided conviction with no pushback the
// entire period. Each wick must stay under this % of the candle's range to
// still count; 0% would only match a textbook-perfect marubozu, which real
// intraday data almost never produces.
const MARUBOZU_MAX_WICK_PCT = 5;
// No published research pins a specific hold time for this pattern on 5-min
// bars — reusing the volume-spike hold as a starting point since both are
// one-sided-conviction continuation signals.
const MARUBOZU_HOLD_MINUTES = 40;

export function detectMarubozu(candle: Candle): MultiStrategySignal | null {
  const range = candle.high - candle.low;
  if (range === 0 || candle.close === candle.open) return null;

  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWickPct = (upperWick / range) * 100;
  const lowerWickPct = (lowerWick / range) * 100;

  if (upperWickPct > MARUBOZU_MAX_WICK_PCT || lowerWickPct > MARUBOZU_MAX_WICK_PCT) return null;

  const direction: ORBDirection = candle.close > candle.open ? "BULLISH" : "BEARISH";
  const bodyPct = 100 - Math.max(upperWickPct, lowerWickPct);

  return {
    strategy: "MARUBOZU",
    direction,
    price: candle.close,
    timestamp: candle.timestamp,
    reason: `${direction === "BULLISH" ? "Bullish" : "Bearish"} marubozu — ${bodyPct.toFixed(1)}% body, negligible wicks — one-sided conviction, expecting continuation`,
    recommendedHoldMinutes: MARUBOZU_HOLD_MINUTES,
  };
}
