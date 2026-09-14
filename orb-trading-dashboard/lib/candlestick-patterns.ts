import type { Candle } from '@/types/trading'

export interface PatternConfidence {
  detected: boolean
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number // 0-1
  description: string
}

/**
 * Morning Star: Strong downtrend → small candle near low → strong bullish close above midpoint
 * Bullish reversal pattern (confidence: 0.8)
 */
export function detectMorningStar(candles: Candle[]): PatternConfidence {
  if (candles.length < 3) {
    return { detected: false, signal: 'NEUTRAL', confidence: 0, description: 'Not enough candles' }
  }

  const [day1, day2, day3] = [candles[candles.length - 3], candles[candles.length - 2], candles[candles.length - 1]]

  const day1Range = day1.high - day1.low
  const day1Close = day1.close
  const day1Mid = day1.low + day1Range / 2

  // Day 1: Strong downtrend (close near low)
  const isDay1Bearish = day1.open > day1.close && day1Close < day1Mid

  // Day 2: Small candle (star)
  const day2Range = day2.high - day2.low
  const isDay2Small = day2Range < day1Range * 0.5

  // Day 3: Strong bullish close above day 1 midpoint
  const isDay3Bullish = day3.close > day1Mid && day3.close > day3.open

  const detected = isDay1Bearish && isDay2Small && isDay3Bullish
  return {
    detected,
    signal: detected ? 'BULLISH' : 'NEUTRAL',
    confidence: detected ? 0.75 : 0,
    description: 'Morning Star: Bullish reversal after downtrend',
  }
}

/**
 * Evening Star: Strong uptrend → small candle near high → strong bearish close below midpoint
 * Bearish reversal pattern (confidence: 0.8)
 */
export function detectEveningStar(candles: Candle[]): PatternConfidence {
  if (candles.length < 3) {
    return { detected: false, signal: 'NEUTRAL', confidence: 0, description: 'Not enough candles' }
  }

  const [day1, day2, day3] = [candles[candles.length - 3], candles[candles.length - 2], candles[candles.length - 1]]

  const day1Range = day1.high - day1.low
  const day1Close = day1.close
  const day1Mid = day1.low + day1Range / 2

  // Day 1: Strong uptrend (close near high)
  const isDay1Bullish = day1.close > day1.open && day1Close > day1Mid

  // Day 2: Small candle (star)
  const day2Range = day2.high - day2.low
  const isDay2Small = day2Range < day1Range * 0.5

  // Day 3: Strong bearish close below day 1 midpoint
  const isDay3Bearish = day3.close < day1Mid && day3.close < day3.open

  const detected = isDay1Bullish && isDay2Small && isDay3Bearish
  return {
    detected,
    signal: detected ? 'BEARISH' : 'NEUTRAL',
    confidence: detected ? 0.75 : 0,
    description: 'Evening Star: Bearish reversal after uptrend',
  }
}

/**
 * Dragonfly Doji: Small body at top, long lower wick
 * Bullish reversal pattern (confidence: 0.6)
 */
export function detectDragonflyDoji(candles: Candle[]): PatternConfidence {
  if (candles.length < 1) {
    return { detected: false, signal: 'NEUTRAL', confidence: 0, description: 'Not enough candles' }
  }

  const candle = candles[candles.length - 1]
  const bodySize = Math.abs(candle.close - candle.open)
  const range = candle.high - candle.low
  const lowerWick = Math.min(candle.open, candle.close) - candle.low
  const upperWick = candle.high - Math.max(candle.open, candle.close)

  // Small body (< 20% of range)
  const isSmallBody = bodySize < range * 0.2
  // Long lower wick (> 2x body)
  const isLongLower = lowerWick > bodySize * 2
  // Short upper wick
  const isShortUpper = upperWick < range * 0.1

  const detected = isSmallBody && isLongLower && isShortUpper
  return {
    detected,
    signal: detected ? 'BULLISH' : 'NEUTRAL',
    confidence: detected ? 0.6 : 0,
    description: 'Dragonfly Doji: Bullish reversal with long lower wick',
  }
}

/**
 * Gravestone Doji: Small body at bottom, long upper wick
 * Bearish reversal pattern (confidence: 0.6)
 */
export function detectGravestoneDoji(candles: Candle[]): PatternConfidence {
  if (candles.length < 1) {
    return { detected: false, signal: 'NEUTRAL', confidence: 0, description: 'Not enough candles' }
  }

  const candle = candles[candles.length - 1]
  const bodySize = Math.abs(candle.close - candle.open)
  const range = candle.high - candle.low
  const lowerWick = Math.min(candle.open, candle.close) - candle.low
  const upperWick = candle.high - Math.max(candle.open, candle.close)

  // Small body (< 20% of range)
  const isSmallBody = bodySize < range * 0.2
  // Long upper wick (> 2x body)
  const isLongUpper = upperWick > bodySize * 2
  // Short lower wick
  const isShortLower = lowerWick < range * 0.1

  const detected = isSmallBody && isLongUpper && isShortLower
  return {
    detected,
    signal: detected ? 'BEARISH' : 'NEUTRAL',
    confidence: detected ? 0.6 : 0,
    description: 'Gravestone Doji: Bearish reversal with long upper wick',
  }
}

/**
 * Bullish Engulfing: Small bearish candle followed by large bullish candle
 * Bullish reversal pattern (confidence: 0.7)
 */
export function detectBullishEngulfing(candles: Candle[]): PatternConfidence {
  if (candles.length < 2) {
    return { detected: false, signal: 'NEUTRAL', confidence: 0, description: 'Not enough candles' }
  }

  const [prev, current] = [candles[candles.length - 2], candles[candles.length - 1]]

  // Previous: Bearish (close < open)
  const isPrevBearish = prev.close < prev.open

  // Current: Bullish (close > open)
  const isCurrBullish = current.close > current.open

  // Current completely engulfs previous
  const engulfs = current.close > prev.open && current.open < prev.close

  const detected = isPrevBearish && isCurrBullish && engulfs
  return {
    detected,
    signal: detected ? 'BULLISH' : 'NEUTRAL',
    confidence: detected ? 0.7 : 0,
    description: 'Bullish Engulfing: Bullish reversal pattern',
  }
}

/**
 * Bearish Engulfing: Small bullish candle followed by large bearish candle
 * Bearish reversal pattern (confidence: 0.7)
 */
export function detectBearishEngulfing(candles: Candle[]): PatternConfidence {
  if (candles.length < 2) {
    return { detected: false, signal: 'NEUTRAL', confidence: 0, description: 'Not enough candles' }
  }

  const [prev, current] = [candles[candles.length - 2], candles[candles.length - 1]]

  // Previous: Bullish (close > open)
  const isPrevBullish = prev.close > prev.open

  // Current: Bearish (close < open)
  const isCurrBearish = current.close < current.open

  // Current completely engulfs previous
  const engulfs = current.open > prev.close && current.close < prev.open

  const detected = isPrevBullish && isCurrBearish && engulfs
  return {
    detected,
    signal: detected ? 'BEARISH' : 'NEUTRAL',
    confidence: detected ? 0.7 : 0,
    description: 'Bearish Engulfing: Bearish reversal pattern',
  }
}

/**
 * Check all patterns and return confirmation for ORB signal
 * Returns: CONFIRM (pattern aligns), WARN (pattern contradicts), NEUTRAL (no pattern)
 */
export function checkPatternConfirmation(candles: Candle[], orbDirection: 'BULLISH' | 'BEARISH'): PatternConfidence {
  const patterns = [
    detectMorningStar(candles),
    detectEveningStar(candles),
    detectDragonflyDoji(candles),
    detectGravestoneDoji(candles),
    detectBullishEngulfing(candles),
    detectBearishEngulfing(candles),
  ]

  const detectedPatterns = patterns.filter((p) => p.detected)

  if (detectedPatterns.length === 0) {
    return { detected: false, signal: 'NEUTRAL', confidence: 0, description: 'No pattern detected' }
  }

  // Calculate weighted confidence
  const totalConfidence = detectedPatterns.reduce((sum, p) => sum + p.confidence, 0) / detectedPatterns.length

  // Check if patterns align with ORB direction
  const alignedCount = detectedPatterns.filter((p) => p.signal === orbDirection).length
  const isAligned = alignedCount > detectedPatterns.length / 2

  const signal = isAligned ? orbDirection : (orbDirection === 'BULLISH' ? 'BEARISH' : 'BULLISH')

  return {
    detected: true,
    signal,
    confidence: isAligned ? totalConfidence : totalConfidence * 0.5, // Reduce confidence if opposing
    description: `${detectedPatterns.length} pattern(s) detected: ${detectedPatterns.map((p) => p.description).join(', ')}`,
  }
}
