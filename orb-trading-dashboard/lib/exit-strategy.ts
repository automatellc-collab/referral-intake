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

// Real incident 2026-09-17: a TSLA 1DTE call rode from -0% to -55% with no
// exit signal, because the trailing stop only fires off a peak and this
// position never had one — it just declined steadily from entry. The
// trailing/time-stop rules protect gains; they have no floor under a
// straight-line loss. This is that floor: -28% (mid of the -25%/-30% band
// the user set), independent of peak or DTE, no exceptions.
const HARD_STOP_LOSS_PCT = 28;

export type ExitAction =
  | 'HOLD'
  | 'HARD_STOP_LOSS'
  | 'TRAILING_STOP'
  | 'TIME_STOP_LOCK_PROFIT'
  | 'TIME_STOP_CUT_LOSS'
  | 'SCALE_OUT_FIRST_TARGET'
  | 'BREAKEVEN_STOP'
  | 'RUNNER_TRAIL_STOP';

// Somesh/Kay Capitals scale-out+trail exit (full-year backtest, 2026-09-30 —
// see scripts/backtest-scale-trail-exit.ts): sell half at a 1R first target,
// move the stop to breakeven, trail the remainder. Backtested per-symbol
// against the existing all-or-nothing exit; net positive on these 7, net
// negative on the rest of the watchlist (QQQ/NVDA/AMD/COIN/LLY keep the
// original single-exit behavior — their big trending winners get cut short
// by an early scale-out). Opt-in by symbol, same convention as
// HIGH_QUALITY_BREAKOUT_SYMBOLS in orb-strategy.ts.
export const SCALE_OUT_TRAIL_SYMBOLS = new Set([
  'SPY', 'TSLA', 'CRWD', 'PLTR', 'META', 'AVGO', 'IWM',
]);

// The live system has no equity-level stop distance to derive "1R" from (it
// tracks option premium, not the underlying's ORB risk) — mirroring the
// existing -28% hard stop gives a 1:1 risk:reward first target in the same
// units the rest of this module already reasons in.
const FIRST_TARGET_GAIN_PCT = HARD_STOP_LOSS_PCT;

// Giveback tolerance for the runner (post-scale-out) leg's trailing stop —
// tighter than TRAILING_STOP_PEAK_GAIN_PCT's 30%-to-breakeven because this
// leg is already risk-free (stop at breakeven) and its job is to protect
// *incremental* gains above the first target, not just avoid a full round
// trip back to flat.
const RUNNER_TRAIL_GIVEBACK_PCT = 20;

export interface PositionState {
  entryPrice: number;
  currentMark: number;
  /** Highest mark price observed since entry — the caller tracks this across
   * checks; this module has no persistence of its own. */
  peakMarkSinceEntry: number;
  isZeroDTE: boolean;
  entryTime: number;
  now: number;
  /** Underlying symbol — gates the scale-out+trail behavior to
   * SCALE_OUT_TRAIL_SYMBOLS. Omit (or any symbol not in that set) to fall
   * back to the original all-or-nothing exit rules. */
  symbol?: string;
  /** Caller-tracked: true once the first-target scale-out has already been
   * acted on (half sold, stop moved to breakeven) for this position. */
  scaledOut?: boolean;
}

export interface ExitDecision {
  shouldExit: boolean;
  action: ExitAction;
  reason: string;
  /** Peak unrealized gain % observed since entry, for logging/backtesting. */
  peakGainPct: number;
  /** Fraction of the remaining position this decision applies to — 0.5 for
   * the first-target scale-out, 1 for every other action (full exit of
   * whatever quantity is currently held). */
  portion: number;
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
  const { entryPrice, currentMark, peakMarkSinceEntry, isZeroDTE, now, symbol, scaledOut } = position;

  const peakGainPct = entryPrice > 0 ? ((peakMarkSinceEntry - entryPrice) / entryPrice) * 100 : 0;
  const usesScaleOutTrail = symbol !== undefined && SCALE_OUT_TRAIL_SYMBOLS.has(symbol);

  // Checked first, ahead of every other rule, scale-out included: a straight
  // decline from entry never sets a peak worth trailing, so this is the only
  // thing that catches it. Applies regardless of DTE, symbol, or whether the
  // position ever showed a gain — the hard stop is never bypassed.
  const currentLossPct = entryPrice > 0 ? ((entryPrice - currentMark) / entryPrice) * 100 : 0;
  if (currentLossPct >= HARD_STOP_LOSS_PCT) {
    return {
      shouldExit: true,
      action: 'HARD_STOP_LOSS',
      reason: `Down ${currentLossPct.toFixed(1)}% from entry — past the -${HARD_STOP_LOSS_PCT}% hard stop, exit regardless of DTE or peak history`,
      peakGainPct,
      portion: 1,
    };
  }

  if (usesScaleOutTrail && !scaledOut) {
    const currentGainPct = entryPrice > 0 ? ((currentMark - entryPrice) / entryPrice) * 100 : 0;
    if (currentGainPct >= FIRST_TARGET_GAIN_PCT) {
      return {
        shouldExit: true,
        action: 'SCALE_OUT_FIRST_TARGET',
        reason: `Up ${currentGainPct.toFixed(1)}% — at the 1R first target, sell half and move the stop on the remainder to breakeven ($${entryPrice.toFixed(2)})`,
        peakGainPct,
        portion: 0.5,
      };
    }
  }

  if (usesScaleOutTrail && scaledOut) {
    // Runner leg: stop is at breakeven, win is already locked in on the half
    // already sold. From here it's pure upside protection — breakeven floor
    // plus a tighter trailing giveback off the peak than the pre-scale-out
    // rule uses, since this leg is risk-free and its only job is protecting
    // gains made after the scale-out.
    if (currentMark <= entryPrice) {
      return {
        shouldExit: true,
        action: 'BREAKEVEN_STOP',
        reason: `Remainder retreated to breakeven ($${entryPrice.toFixed(2)}) after scaling out — exit the rest, the first-target half already locked in the win`,
        peakGainPct,
        portion: 1,
      };
    }

    const givebackFromPeakPct =
      peakMarkSinceEntry > 0 ? ((peakMarkSinceEntry - currentMark) / peakMarkSinceEntry) * 100 : 0;
    if (givebackFromPeakPct >= RUNNER_TRAIL_GIVEBACK_PCT) {
      return {
        shouldExit: true,
        action: 'RUNNER_TRAIL_STOP',
        reason: `Runner gave back ${givebackFromPeakPct.toFixed(1)}% off its peak (+${peakGainPct.toFixed(1)}%) — lock in the remainder before it decays further`,
        peakGainPct,
        portion: 1,
      };
    }
  }

  if (!usesScaleOutTrail || !scaledOut) {
    // Original all-or-nothing trailing stop — applies to every symbol not
    // opted into scale-out+trail, and to opted-in symbols before their first
    // scale-out fires (a position that never reaches 1R still needs this
    // floor under a round-trip).
    const hasBreachedTrailingStop =
      peakGainPct >= TRAILING_STOP_PEAK_GAIN_PCT && currentMark <= entryPrice;

    if (hasBreachedTrailingStop) {
      return {
        shouldExit: true,
        action: 'TRAILING_STOP',
        reason: `Peaked at +${peakGainPct.toFixed(1)}% but retreated to breakeven or below — lock in remaining value before it decays further`,
        peakGainPct,
        portion: 1,
      };
    }
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
        portion: 1,
      };
    }
    return {
      shouldExit: true,
      action: 'TIME_STOP_CUT_LOSS',
      reason: '2:30 PM ET time-stop reached on a 0DTE position that is currently underwater — cut it now rather than let theta carry it to worthless by expiration',
      peakGainPct,
      portion: 1,
    };
  }

  return {
    shouldExit: false,
    action: 'HOLD',
    reason: 'No exit condition met',
    peakGainPct,
    portion: 1,
  };
}
