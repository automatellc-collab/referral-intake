import { describe, it, expect } from 'vitest'
import { checkExitSignal, type PositionState } from '../exit-strategy'

// 2026-09-15 is the reference day used throughout; ET = UTC-4 (EDT)
function etTimestamp(hour: number, minute: number, day = 15): number {
  return Date.UTC(2026, 8, day, hour + 4, minute, 0)
}

function makePosition(overrides: Partial<PositionState> = {}): PositionState {
  return {
    entryPrice: 0.784,
    currentMark: 0.784,
    peakMarkSinceEntry: 0.784,
    isZeroDTE: true,
    entryTime: etTimestamp(10, 45),
    now: etTimestamp(11, 0),
    ...overrides,
  }
}

describe('checkExitSignal — 0DTE positions', () => {
  it('holds early in the day when position is flat', () => {
    const position = makePosition({ now: etTimestamp(11, 0) })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
    expect(decision.action).toBe('HOLD')
  })

  it('holds early in the day even if slightly profitable, no trailing-stop breach yet', () => {
    const position = makePosition({
      currentMark: 0.85,
      peakMarkSinceEntry: 0.85,
      now: etTimestamp(11, 30),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
  })

  it('triggers a trailing-stop exit when premium peaked +30% then fell back to breakeven', () => {
    // Peaked at 0.784 * 1.35 = 1.058 (+35%), now back down to entry price
    const position = makePosition({
      entryPrice: 0.784,
      currentMark: 0.784,
      peakMarkSinceEntry: 1.058,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('TRAILING_STOP')
  })

  it('does not trigger trailing stop if peak gain was under 30%', () => {
    // Peaked at only +10%, giving back some of that is normal noise
    const position = makePosition({
      entryPrice: 0.784,
      currentMark: 0.784,
      peakMarkSinceEntry: 0.86,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
  })

  it('forces exit at the 2:30 PM ET time-stop when position is profitable — lock in the gain', () => {
    const position = makePosition({
      entryPrice: 0.784,
      currentMark: 1.0,
      peakMarkSinceEntry: 1.0,
      now: etTimestamp(14, 30),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('TIME_STOP_LOCK_PROFIT')
  })

  it('forces exit at the 2:30 PM ET time-stop when position is at a loss — cut it rather than let it decay to zero', () => {
    const position = makePosition({
      entryPrice: 0.784,
      currentMark: 0.4,
      peakMarkSinceEntry: 0.784,
      now: etTimestamp(14, 30),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('TIME_STOP_CUT_LOSS')
  })

  it('forces exit after 2:30 PM ET even if exactly at breakeven', () => {
    const position = makePosition({
      entryPrice: 0.784,
      currentMark: 0.784,
      peakMarkSinceEntry: 0.784,
      now: etTimestamp(15, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
  })

  it('reproduces the real SPY 0DTE loss scenario: held past time-stop, would have forced an earlier exit', () => {
    // Real trade: entry $0.784, mark declined through the day, auto-closed at $0.13 near expiry.
    // At 2:30 PM the mark was still meaningfully above the final $0.13 close.
    const position = makePosition({
      entryPrice: 0.784,
      currentMark: 0.235, // mark observed at ~3:42 PM check in the real trade
      peakMarkSinceEntry: 0.784,
      now: etTimestamp(14, 30),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('TIME_STOP_CUT_LOSS')
  })
})

describe('checkExitSignal — multi-day (non-0DTE) positions', () => {
  it('holds regardless of time of day when position is not 0DTE', () => {
    const position = makePosition({
      isZeroDTE: false,
      currentMark: 0.784,
      peakMarkSinceEntry: 0.784,
      now: etTimestamp(15, 45), // would trigger time-stop if 0DTE
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
  })

  it('still applies the trailing stop for multi-day positions', () => {
    const position = makePosition({
      isZeroDTE: false,
      entryPrice: 4.85,
      currentMark: 4.85,
      peakMarkSinceEntry: 6.5, // +34% peak, matches the real COIN trade
      now: etTimestamp(15, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('TRAILING_STOP')
  })

  it('reproduces the real COIN win: no time pressure, held through to a profitable close without trailing-stop breach', () => {
    const position = makePosition({
      isZeroDTE: false,
      entryPrice: 4.85,
      currentMark: 5.0,
      peakMarkSinceEntry: 5.0,
      now: etTimestamp(14, 21),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
  })
})

describe('checkExitSignal — edge cases', () => {
  it('handles a position entered exactly at the time-stop boundary', () => {
    const position = makePosition({
      entryTime: etTimestamp(14, 30),
      now: etTimestamp(14, 30),
      currentMark: 0.784,
      peakMarkSinceEntry: 0.784,
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
  })

  it('never reports a negative or NaN gain percentage', () => {
    const position = makePosition({ entryPrice: 0, currentMark: 0.5, peakMarkSinceEntry: 0.5 })
    const decision = checkExitSignal(position)
    expect(Number.isNaN(decision.peakGainPct)).toBe(false)
  })
})
