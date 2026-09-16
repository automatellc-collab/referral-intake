// Exit/position-management layer. Built 2026-09-15 per council review: the
// tool's entries were fine (89% win rate on tool-attributed trades) but it
// had NO exit logic at all — both real losses were correct-direction 0DTE
// puts held to expiration and auto-liquidated near-worthless. A same-signal
// COIN put with 3 DTE (no clock pressure) closed for a real gain instead.
// This module is the fix: a deterministic rules engine, not a model —
// n=19 trades can validate simple rules retrospectively but can't support
// anything statistically fit.

// 90 minutes before the 4:00 PM ET close. Past this point a 0DTE position's
// remaining decision window is short enough that riding it further is pure
// theta risk with no time left for the thesis to develop.
const TIME_STOP_HOUR_ET = 14;
const TIME_STOP_MINUTE_ET = 30;

// A retreat of 30%+ off the peak, back to breakeven or worse, means the
// position had real profit on the table and gave it back — lock in the
// exit rather than let a winner round-trip into a loser (or a loser decay
// further). 30% is deliberately generous: smaller peak gains are normal
// noise on a 0DTE option and shouldn't trigger an exit.
const TRAILING_STOP_PEAK_GAIN_PCT = 30;

export type ExitAction =
  | 'HOLD'
  | 'TRAILING_STOP'
  | 'TIME_STOP_LOCK_PROFIT'
  | 'TIME_STOP_CUT_LOSS';

export interface PositionState {
  entryPrice: number;
  currentMark: number;
  /** Highest mark price observed since entry — the caller tracks this across
   * checks; this module has no persistence of its own. */
  peakMarkSinceEntry: number;
  isZeroDTE: boolean;
  entryTime: number;
  now: number;
}

export interface ExitDecision {
  shouldExit: boolean;
  action: ExitAction;
  reason: string;
  /** Peak unrealized gain % observed since entry, for logging/backtesting. */
  peakGainPct: number;
}

function getEasternHourMinute(timestampMs: number): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(timestampMs));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

function isAtOrPastTimeStop(nowMs: number): boolean {
  const { hour, minute } = getEasternHourMinute(nowMs);
  return hour > TIME_STOP_HOUR_ET || (hour === TIME_STOP_HOUR_ET && minute >= TIME_STOP_MINUTE_ET);
}

export function checkExitSignal(position: PositionState): ExitDecision {
  const { entryPrice, currentMark, peakMarkSinceEntry, isZeroDTE, now } = position;

  const peakGainPct = entryPrice > 0 ? ((peakMarkSinceEntry - entryPrice) / entryPrice) * 100 : 0;
  const currentGainFromPeakPct =
    peakMarkSinceEntry > 0 ? ((currentMark - peakMarkSinceEntry) / peakMarkSinceEntry) * 100 : 0;

  // Trailing stop applies regardless of DTE: if the position peaked with a
  // real gain and has since retreated all the way back to breakeven (or
  // below), that profit is gone and won't reliably come back on its own.
  const hasBreachedTrailingStop =
    peakGainPct >= TRAILING_STOP_PEAK_GAIN_PCT && currentMark <= entryPrice;

  if (hasBreachedTrailingStop) {
    return {
      shouldExit: true,
      action: 'TRAILING_STOP',
      reason: `Peaked at +${peakGainPct.toFixed(1)}% but retreated to breakeven or below — lock in remaining value before it decays further`,
      peakGainPct,
    };
  }

  // Only 0DTE positions face the intraday clock — a multi-day position has
  // no reason to be forced out just because it's 2:30 PM.
  if (isZeroDTE && isAtOrPastTimeStop(now)) {
    if (currentMark > entryPrice) {
      return {
        shouldExit: true,
        action: 'TIME_STOP_LOCK_PROFIT',
        reason: '2:30 PM ET time-stop reached on a 0DTE position that is currently profitable — lock in the gain rather than risk decay into the close',
        peakGainPct,
      };
    }
    return {
      shouldExit: true,
      action: 'TIME_STOP_CUT_LOSS',
      reason: '2:30 PM ET time-stop reached on a 0DTE position that is currently underwater — cut it now rather than let theta carry it to worthless by expiration',
      peakGainPct,
    };
  }

  return {
    shouldExit: false,
    action: 'HOLD',
    reason: 'No exit condition met',
    peakGainPct,
  };
}
