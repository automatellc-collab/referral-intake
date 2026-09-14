/**
 * 200-day SMA rejection strategy: on a 5-min intraday chart, price
 * approaching the 200-day SMA (computed from daily closes) tends to get
 * rejected — wicking through the level but closing back on the side it
 * approached from — rather than breaking cleanly through. The rejection
 * direction is the trade direction. Distinct from the ORB strategy
 * (lib/orb-strategy.ts): no opening range or breakout precondition, just
 * proximity to a single longer-term trend level, and works across any
 * symbol rather than one intraday range per day.
 */
import type { Candle, ORBDirection } from "@/types/trading";

export function calculateSMA(dailyCloses: number[], period: number): number {
  if (dailyCloses.length < period) {
    throw new Error(`Need at least ${period} daily closes, got ${dailyCloses.length}`);
  }
  const window = dailyCloses.slice(-period);
  return window.reduce((sum, close) => sum + close, 0) / period;
}

export interface SMARejectionSignal {
  direction: ORBDirection;
  price: number;
  stopLoss: number;
  takeProfit: number;
  smaLevel: number;
  detectedAt: number;
}

const RISK_REWARD_RATIO = 3;

export function detectSMARejection(candle: Candle, smaLevel: number): SMARejectionSignal | null {
  const touchedLevel = candle.high >= smaLevel && candle.low <= smaLevel;
  if (!touchedLevel) {
    return null;
  }

  if (candle.open < smaLevel && candle.close < smaLevel) {
    // Approached from below, wicked up to/through the level, closed back
    // below it — rejected at resistance. stopLoss is the wick high: if
    // price later exceeds it, the rejection failed.
    const stopLoss = candle.high;
    const riskPerShare = stopLoss - candle.close;
    return {
      direction: "BEARISH",
      price: candle.close,
      stopLoss,
      takeProfit: candle.close - riskPerShare * RISK_REWARD_RATIO,
      smaLevel,
      detectedAt: candle.timestamp,
    };
  }

  if (candle.open > smaLevel && candle.close > smaLevel) {
    // Approached from above, wicked down to/through the level, closed back
    // above it — rejected at support (bounced).
    const stopLoss = candle.low;
    const riskPerShare = candle.close - stopLoss;
    return {
      direction: "BULLISH",
      price: candle.close,
      stopLoss,
      takeProfit: candle.close + riskPerShare * RISK_REWARD_RATIO,
      smaLevel,
      detectedAt: candle.timestamp,
    };
  }

  return null;
}
