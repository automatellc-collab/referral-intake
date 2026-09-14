import { describe, it, expect } from 'vitest'
import {
  detectMorningStar,
  detectEveningStar,
  detectDragonflyDoji,
  detectGravestoneDoji,
  detectBullishEngulfing,
  detectBearishEngulfing,
  PatternConfidence,
} from '../candlestick-patterns'
import type { Candle } from '@/types/trading'

describe('Candlestick Pattern Detection', () => {
  describe('Morning Star (Bullish reversal)', () => {
    it('detects morning star pattern', () => {
      const candles: Candle[] = [
        // Day 1: Strong downtrend
        { timestamp: 1000, open: 100, high: 100.5, low: 98, close: 98.5, volume: 1000 },
        // Day 2: Small candle near low (star)
        { timestamp: 2000, open: 98.2, high: 98.6, low: 97.8, close: 98, volume: 500 },
        // Day 3: Strong bullish candle closing above midpoint of day 1
        { timestamp: 3000, open: 98.5, high: 101, low: 98, close: 100.5, volume: 1500 },
      ]

      const pattern = detectMorningStar(candles)
      expect(pattern.detected).toBe(true)
      expect(pattern.confidence).toBeGreaterThan(0.7)
      expect(pattern.signal).toBe('BULLISH')
    })

    it('rejects when pattern conditions not met', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 100.5, low: 99, close: 99.5, volume: 1000 },
        { timestamp: 2000, open: 99.5, high: 100, low: 99, close: 99.8, volume: 1000 },
        { timestamp: 3000, open: 99.8, high: 100.2, low: 99.5, close: 100, volume: 1000 },
      ]

      const pattern = detectMorningStar(candles)
      expect(pattern.detected).toBe(false)
    })
  })

  describe('Evening Star (Bearish reversal)', () => {
    it('detects evening star pattern', () => {
      const candles: Candle[] = [
        // Day 1: Strong uptrend
        { timestamp: 1000, open: 100, high: 102, low: 100, close: 101.5, volume: 1000 },
        // Day 2: Small candle near high (star)
        { timestamp: 2000, open: 101.7, high: 102.1, low: 101.3, close: 101.5, volume: 500 },
        // Day 3: Strong bearish candle closing below midpoint of day 1
        { timestamp: 3000, open: 101.2, high: 101.5, low: 99, close: 99.5, volume: 1500 },
      ]

      const pattern = detectEveningStar(candles)
      expect(pattern.detected).toBe(true)
      expect(pattern.confidence).toBeGreaterThan(0.7)
      expect(pattern.signal).toBe('BEARISH')
    })
  })

  describe('Dragonfly Doji (Bullish reversal)', () => {
    it('detects dragonfly doji', () => {
      // Dragonfly: small body at top, long lower wick
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 97, close: 100.8, volume: 1000 },
      ]

      const pattern = detectDragonflyDoji(candles)
      expect(pattern.detected).toBe(true)
      expect(pattern.signal).toBe('BULLISH')
    })

    it('rejects when wick too short', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99.5, close: 100.8, volume: 1000 },
      ]

      const pattern = detectDragonflyDoji(candles)
      expect(pattern.detected).toBe(false)
    })
  })

  describe('Gravestone Doji (Bearish reversal)', () => {
    it('detects gravestone doji', () => {
      // Gravestone: small body at bottom, long upper wick
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 103, low: 99, close: 99.2, volume: 1000 },
      ]

      const pattern = detectGravestoneDoji(candles)
      expect(pattern.detected).toBe(true)
      expect(pattern.signal).toBe('BEARISH')
    })
  })

  describe('Bullish Engulfing (Bullish reversal)', () => {
    it('detects bullish engulfing', () => {
      const candles: Candle[] = [
        // Day 1: Small bearish candle
        { timestamp: 1000, open: 100.5, high: 100.8, low: 100, close: 100.2, volume: 500 },
        // Day 2: Large bullish candle that completely engulfs day 1
        { timestamp: 2000, open: 100, high: 102, low: 100, close: 101.8, volume: 1500 },
      ]

      const pattern = detectBullishEngulfing(candles)
      expect(pattern.detected).toBe(true)
      expect(pattern.signal).toBe('BULLISH')
    })
  })

  describe('Bearish Engulfing (Bearish reversal)', () => {
    it('detects bearish engulfing', () => {
      const candles: Candle[] = [
        // Day 1: Small bullish candle
        { timestamp: 1000, open: 100, high: 100.8, low: 100, close: 100.5, volume: 500 },
        // Day 2: Large bearish candle that completely engulfs day 1
        { timestamp: 2000, open: 100.8, high: 100.8, low: 99, close: 99.2, volume: 1500 },
      ]

      const pattern = detectBearishEngulfing(candles)
      expect(pattern.detected).toBe(true)
      expect(pattern.signal).toBe('BEARISH')
    })
  })

  describe('Pattern confirmation for ORB strategy', () => {
    it('bullish pattern confirms bullish ORB signal', () => {
      const bullishCandles: Candle[] = [
        { timestamp: 1000, open: 100, high: 102, low: 100, close: 101.5, volume: 1000 },
        { timestamp: 2000, open: 101.7, high: 102.1, low: 101.3, close: 101.5, volume: 500 },
        { timestamp: 3000, open: 101.2, high: 101.5, low: 99, close: 99.5, volume: 1500 },
      ]

      const eveningPattern = detectEveningStar(bullishCandles)
      // Evening star is bearish, so it warns against bullish ORB signal
      expect(eveningPattern.signal).toBe('BEARISH')
    })

    it('no pattern found returns neutral confidence', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000 },
      ]

      const pattern = detectMorningStar([candles[0]])
      expect(pattern.detected).toBe(false)
      expect(pattern.confidence).toBe(0)
    })
  })
})
