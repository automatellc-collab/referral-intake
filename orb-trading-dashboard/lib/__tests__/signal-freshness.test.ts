import { describe, it, expect } from 'vitest'
import { calculateSignalFreshness } from '../signal-freshness'
import type { EntrySignal } from '@/types/trading'

function makeEntry(overrides: Partial<EntrySignal> = {}): EntrySignal {
  return {
    type: 'FIBONACCI',
    symbol: 'SPY',
    direction: 'BULLISH',
    price: 760.0,
    stopLoss: 758.45,
    takeProfit: 764.65,
    riskRewardRatio: 3,
    detectedAt: Date.now() - 5 * 60 * 1000, // 5 min ago
    ...overrides,
  }
}

describe('calculateSignalFreshness', () => {
  it('reports zero drift when current price equals trigger price', () => {
    const entry = makeEntry({ price: 760.0 })
    const freshness = calculateSignalFreshness(entry, 760.0, Date.now())
    expect(freshness.distanceFromTriggerUsd).toBeCloseTo(0, 2)
    expect(freshness.distanceFromTriggerPct).toBeCloseTo(0, 2)
  })

  it('reports positive drift when price has moved beyond trigger in signal direction', () => {
    const entry = makeEntry({ price: 760.0, direction: 'BULLISH' })
    const freshness = calculateSignalFreshness(entry, 762.36, Date.now())
    expect(freshness.distanceFromTriggerUsd).toBeCloseTo(2.36, 2)
    expect(freshness.distanceFromTriggerPct).toBeCloseTo((2.36 / 760.0) * 100, 2)
  })

  it('reports negative drift when price has moved against signal direction (BULLISH)', () => {
    const entry = makeEntry({ price: 760.0, direction: 'BULLISH' })
    const freshness = calculateSignalFreshness(entry, 757.0, Date.now())
    expect(freshness.distanceFromTriggerUsd).toBeCloseTo(-3.0, 2)
  })

  it('reports positive drift for BEARISH when price has moved below trigger (favorable)', () => {
    const entry = makeEntry({ price: 357.49, direction: 'BEARISH' })
    const freshness = calculateSignalFreshness(entry, 355.0, Date.now())
    expect(freshness.distanceFromTriggerUsd).toBeCloseTo(2.49, 2)
  })

  it('reports negative drift for BEARISH when price has moved above trigger (unfavorable/invalidated)', () => {
    const entry = makeEntry({ price: 357.49, direction: 'BEARISH' })
    const freshness = calculateSignalFreshness(entry, 363.72, Date.now())
    expect(freshness.distanceFromTriggerUsd).toBeCloseTo(-6.23, 2)
  })

  it('calculates ageMinutes from detectedAt to now', () => {
    const detectedAt = Date.now() - 12 * 60 * 1000 // 12 min ago
    const entry = makeEntry({ detectedAt })
    const freshness = calculateSignalFreshness(entry, entry.price, Date.now())
    expect(freshness.ageMinutes).toBeCloseTo(12, 0)
  })

  it('marks isStale true when drift is negative (price moved against thesis)', () => {
    const entry = makeEntry({ price: 357.49, direction: 'BEARISH' })
    const freshness = calculateSignalFreshness(entry, 363.72, Date.now())
    expect(freshness.isStale).toBe(true)
  })

  it('marks isStale false when drift is positive or neutral', () => {
    const entry = makeEntry({ price: 760.0, direction: 'BULLISH' })
    const freshness = calculateSignalFreshness(entry, 762.36, Date.now())
    expect(freshness.isStale).toBe(false)
  })

  it('marks isChasing true when favorable drift exceeds 0.25% (price ran away)', () => {
    const entry = makeEntry({ price: 760.0, direction: 'BULLISH' })
    // 762.36 is +0.31% from 760.0
    const freshness = calculateSignalFreshness(entry, 762.36, Date.now())
    expect(freshness.isChasing).toBe(true)
  })

  it('marks isChasing false when favorable drift is small', () => {
    const entry = makeEntry({ price: 172.5, direction: 'BULLISH' })
    // 172.51 is ~0.006% from 172.5 — negligible drift
    const freshness = calculateSignalFreshness(entry, 172.51, Date.now())
    expect(freshness.isChasing).toBe(false)
  })

  it('marks isChasing false when signal is stale (negative drift takes priority)', () => {
    const entry = makeEntry({ price: 357.49, direction: 'BEARISH' })
    const freshness = calculateSignalFreshness(entry, 363.72, Date.now())
    expect(freshness.isChasing).toBe(false)
    expect(freshness.isStale).toBe(true)
  })

  it('returns a human-readable freshness label', () => {
    const freshEntry = makeEntry({ price: 172.5, direction: 'BULLISH' })
    const fresh = calculateSignalFreshness(freshEntry, 172.51, Date.now())
    expect(fresh.label).toBe('FRESH')

    const chasingEntry = makeEntry({ price: 760.0, direction: 'BULLISH' })
    const chasing = calculateSignalFreshness(chasingEntry, 762.36, Date.now())
    expect(chasing.label).toBe('CHASING')

    const staleEntry = makeEntry({ price: 357.49, direction: 'BEARISH' })
    const stale = calculateSignalFreshness(staleEntry, 363.72, Date.now())
    expect(stale.label).toBe('STALE')
  })
})
