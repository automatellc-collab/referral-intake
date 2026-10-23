import type { Candle, EntrySignal } from "@/types/trading";
import { getEasternMinutesOfDay } from "@/lib/market-hours";

// Full-year backtest across SPY/QQQ/TSLA/COIN/IWM (see
// scripts/backtest-opening-trend.ts, run 2026-09-30): days where a big
// opening candle was followed by a second same-direction big candle within
// ~30 min averaged +0.15% to +0.50% further movement in that direction over
// the next ~60 min (33-45% hit a >=0.3% continuation). Days that just
// consolidated instead averaged flat-to-negative (6-33% continuation).
const ROLLING_LOOKBACK = 3;
const BIG_CANDLE_MULTIPLIER = 1.8;
const CONFIRM_WINDOW_CANDLES = 6; // ~30 min at 5-min bars
const MARKET_OPEN_MIN = 9 * 60 + 30;
const MARKET_CLOSE_MIN = 16 * 60;

export type OpeningTrendDirection = "UP" | "DOWN";
export type OpeningTrendStatus = "TREND" | "CHOPPY" | "PENDING" | "NO_BREAKOUT";

export interface OpeningTrendResult {
  status: OpeningTrendStatus;
  direction: OpeningTrendDirection | null;
  breakoutCandle: Candle | null;
  confirmCandle: Candle | null;
}

function rthCandles(candles: Candle[]): Candle[] {
  return candles
    .filter((c) => {
      const m = getEasternMinutesOfDay(c.timestamp);
      return m >= MARKET_OPEN_MIN && m < MARKET_CLOSE_MIN;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Detects the opening-candle/trend setup for today's session so far:
 * a "big" 5-min candle (range well above the recent rolling average),
 * followed within ~30 min by another big candle in the same direction
 * (TREND — send the signal) or by consolidation with no confirmation yet
 * (PENDING, still inside the window) or none at all (CHOPPY).
 */
export function detectOpeningTrend(todayCandles: Candle[]): OpeningTrendResult {
  const session = rthCandles(todayCandles);

  if (session.length <= ROLLING_LOOKBACK) {
    return { status: "NO_BREAKOUT", direction: null, breakoutCandle: null, confirmCandle: null };
  }

  let breakoutIdx = -1;
  let direction: OpeningTrendDirection | null = null;

  for (let i = ROLLING_LOOKBACK; i < session.length; i++) {
    const lookback = session.slice(i - ROLLING_LOOKBACK, i);
    const avgRange = lookback.reduce((s, c) => s + (c.high - c.low), 0) / lookback.length;
    if (avgRange <= 0) continue;

    const candle = session[i];
    const range = candle.high - candle.low;
    if (range > BIG_CANDLE_MULTIPLIER * avgRange) {
      breakoutIdx = i;
      direction = candle.close > candle.open ? "UP" : "DOWN";
      break;
    }
  }

  if (breakoutIdx === -1 || !direction) {
    return { status: "NO_BREAKOUT", direction: null, breakoutCandle: null, confirmCandle: null };
  }

  const breakoutCandle = session[breakoutIdx];
  const lookback = session.slice(breakoutIdx - ROLLING_LOOKBACK, breakoutIdx);
  const baselineAvgRange = lookback.reduce((s, c) => s + (c.high - c.low), 0) / lookback.length;

  const windowEnd = Math.min(breakoutIdx + CONFIRM_WINDOW_CANDLES, session.length - 1);

  for (let j = breakoutIdx + 1; j <= windowEnd; j++) {
    const c = session[j];
    const range = c.high - c.low;
    const candleDirection: OpeningTrendDirection = c.close > c.open ? "UP" : "DOWN";
    if (range > BIG_CANDLE_MULTIPLIER * baselineAvgRange && candleDirection === direction) {
      return { status: "TREND", direction, breakoutCandle, confirmCandle: c };
    }
  }

  const windowComplete = session.length - 1 >= breakoutIdx + CONFIRM_WINDOW_CANDLES;
  return {
    status: windowComplete ? "CHOPPY" : "PENDING",
    direction,
    breakoutCandle,
    confirmCandle: null,
  };
}

const DEFAULT_RISK_REWARD_RATIO = 2;

/**
 * Builds the tradeable EntrySignal for a TREND-confirmed opening-trend
 * result: entry at the confirming candle's close, stop at the breakout
 * candle's opposite extreme (the level that would invalidate the whole
 * setup), target sized off that risk by riskRewardRatio.
 */
export function getOpeningTrendEntrySignal(
  result: OpeningTrendResult,
  symbol: string,
  riskRewardRatio: number = DEFAULT_RISK_REWARD_RATIO,
): EntrySignal | null {
  if (result.status !== "TREND" || !result.direction || !result.breakoutCandle || !result.confirmCandle) {
    return null;
  }

  const { direction, breakoutCandle, confirmCandle } = result;
  const price = confirmCandle.close;
  const stopLoss = direction === "UP" ? breakoutCandle.low : breakoutCandle.high;
  const risk = Math.abs(price - stopLoss);
  const takeProfit = direction === "UP" ? price + risk * riskRewardRatio : price - risk * riskRewardRatio;

  return {
    type: "OPENING_TREND",
    symbol,
    direction: direction === "UP" ? "BULLISH" : "BEARISH",
    price,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    detectedAt: confirmCandle.timestamp,
  };
}
