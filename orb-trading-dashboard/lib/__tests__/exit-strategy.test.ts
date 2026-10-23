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

describe('checkExitSignal — hard stop-loss', () => {
  it('exits a straight-line decline mid-day that never set a peak — the trailing stop cannot catch this (real 2026-09-17 TSLA incident: 2.27 -> 1.01, -55%, never flagged)', () => {
    const position = makePosition({
      entryPrice: 2.27,
      currentMark: 1.6,
      peakMarkSinceEntry: 2.27,
      isZeroDTE: false,
      now: etTimestamp(11, 30),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('HARD_STOP_LOSS')
  })

  it('holds when the loss is under the -28% hard-stop threshold', () => {
    const position = makePosition({
      entryPrice: 2.27,
      currentMark: 1.7,
      peakMarkSinceEntry: 2.27,
      isZeroDTE: false,
      now: etTimestamp(11, 30),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
    expect(decision.action).toBe('HOLD')
  })
})

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
    // -49% breaches the hard stop before the time-stop even applies — a
    // strictly earlier/stronger catch than TIME_STOP_CUT_LOSS would be.
    expect(decision.action).toBe('HARD_STOP_LOSS')
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
    // -70% breaches the hard stop well before 2:30 PM would have.
    expect(decision.action).toBe('HARD_STOP_LOSS')
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

  it('every decision carries a portion (1 unless explicitly scaling out)', () => {
    const decision = checkExitSignal(makePosition())
    expect(decision.portion).toBe(1)
  })
})

describe('checkExitSignal — scale-out+trail (opted-in symbols only)', () => {
  it('ignores the scale-out behavior for a symbol not in SCALE_OUT_TRAIL_SYMBOLS (e.g. LLY), using the original trailing-stop rule instead', () => {
    const position = makePosition({
      symbol: 'LLY',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 1.3, // +30%, would hit SCALE_OUT_FIRST_TARGET if opted in
      peakMarkSinceEntry: 1.3,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.action).not.toBe('SCALE_OUT_FIRST_TARGET')
    expect(decision.shouldExit).toBe(false)
  })

  it('fires SCALE_OUT_FIRST_TARGET at +28% for an opted-in symbol not yet scaled out, portion 0.5', () => {
    const position = makePosition({
      symbol: 'SPY',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 1.28,
      peakMarkSinceEntry: 1.28,
      scaledOut: false,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('SCALE_OUT_FIRST_TARGET')
    expect(decision.portion).toBe(0.5)
  })

  it('holds an opted-in symbol below the +28% first target, same as before scale-out exists', () => {
    const position = makePosition({
      symbol: 'TSLA',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 1.1,
      peakMarkSinceEntry: 1.1,
      scaledOut: false,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
  })

  it('hard stop still fires for an opted-in symbol even before any scale-out', () => {
    const position = makePosition({
      symbol: 'IWM',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 0.7, // -30%, past the -28% hard stop
      peakMarkSinceEntry: 1.0,
      scaledOut: false,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('HARD_STOP_LOSS')
    expect(decision.portion).toBe(1)
  })

  it('exits the runner at BREAKEVEN_STOP once scaled out and the mark retreats to entry', () => {
    const position = makePosition({
      symbol: 'CRWD',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 1.0,
      peakMarkSinceEntry: 1.5,
      scaledOut: true,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('BREAKEVEN_STOP')
    expect(decision.portion).toBe(1)
  })

  it('exits the runner at RUNNER_TRAIL_STOP after a 20%+ giveback off its peak, even while still above breakeven', () => {
    const position = makePosition({
      symbol: 'META',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 1.4, // peaked at 1.8, now down 22.2% from peak but still +40% from entry
      peakMarkSinceEntry: 1.8,
      scaledOut: true,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(true)
    expect(decision.action).toBe('RUNNER_TRAIL_STOP')
  })

  it('holds the runner when giveback off peak is under 20% and still above breakeven', () => {
    const position = makePosition({
      symbol: 'AVGO',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 1.6, // peaked at 1.8, only an 11% giveback
      peakMarkSinceEntry: 1.8,
      scaledOut: true,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.shouldExit).toBe(false)
  })

  it('once scaled out, never re-fires SCALE_OUT_FIRST_TARGET even if the mark climbs further', () => {
    const position = makePosition({
      symbol: 'PLTR',
      isZeroDTE: false,
      entryPrice: 1.0,
      currentMark: 1.5,
      peakMarkSinceEntry: 1.5,
      scaledOut: true,
      now: etTimestamp(12, 0),
    })
    const decision = checkExitSignal(position)
    expect(decision.action).not.toBe('SCALE_OUT_FIRST_TARGET')
  })
})
