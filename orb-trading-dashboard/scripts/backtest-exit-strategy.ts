#!/usr/bin/env npx tsx
/**
 * Backtests the new exit-strategy rules engine (lib/exit-strategy.ts)
 * against the 19 tool-attributed trades from 2026-09-14/15, using real
 * entry/exit timestamps and mark prices pulled from Robinhood order
 * history and live option quotes during the session.
 *
 * Data completeness note: full tick-by-tick mark-price history isn't
 * available for every trade — only entry price, exit price, and (for the
 * two losing SPY trades) one known intermediate mark checkpoint. Where
 * exact 2:30 PM ET marks aren't known, this uses the closest available
 * checkpoint as a conservative proxy, and says so explicitly.
 */

import { checkExitSignal, type PositionState } from "../lib/exit-strategy";

function etTimestamp(hour: number, minute: number, day: number): number {
  return Date.UTC(2026, 8, day, hour + 4, minute, 0); // EDT = UTC-4
}

interface HistoricalTrade {
  label: string;
  entryPrice: number;
  exitPrice: number;
  exitContracts: number;
  entryTimeET: [number, number]; // [hour, minute]
  exitTimeET: [number, number];
  day: number;
  isZeroDTE: boolean;
  /** Known intermediate mark price + time, if any (used for the two losses). */
  knownCheckpoint?: { timeET: [number, number]; mark: number };
  actualPnl: number;
}

const trades: HistoricalTrade[] = [
  // 09-14 0DTE winners — all scalped out within an hour of entry
  { label: "TSLA $357.50P 0DTE", entryPrice: 1.897, exitPrice: 2.15, exitContracts: 3, entryTimeET: [10, 26], exitTimeET: [10, 26], day: 14, isZeroDTE: true, actualPnl: 77 },
  { label: "AMD $492.50C 0DTE", entryPrice: 2.13, exitPrice: 2.4667, exitContracts: 3, entryTimeET: [11, 45], exitTimeET: [12, 18], day: 14, isZeroDTE: true, actualPnl: 101 },
  { label: "NVDA $212.50C 0DTE", entryPrice: 0.37, exitPrice: 0.453, exitContracts: 10, entryTimeET: [12, 21], exitTimeET: [13, 25], day: 14, isZeroDTE: true, actualPnl: 83 },
  // 09-15 0DTE winners — also scalped out quickly
  { label: "Joint QQQ $707P 0DTE", entryPrice: 1.18, exitPrice: 1.55, exitContracts: 2, entryTimeET: [11, 20], exitTimeET: [11, 22], day: 15, isZeroDTE: true, actualPnl: 74 },
  { label: "Investing SPY $757P 0DTE", entryPrice: 0.91, exitPrice: 1.05, exitContracts: 3, entryTimeET: [10, 46], exitTimeET: [10, 52], day: 15, isZeroDTE: true, actualPnl: 42 },
  { label: "Joint SPY $757P 0DTE (rd1)", entryPrice: 0.90, exitPrice: 1.05, exitContracts: 4, entryTimeET: [10, 45], exitTimeET: [10, 49], day: 15, isZeroDTE: true, actualPnl: 60 },
  { label: "Investing QQQ $706P 0DTE", entryPrice: 1.13, exitPrice: 1.30, exitContracts: 10, entryTimeET: [10, 33], exitTimeET: [10, 34], day: 15, isZeroDTE: true, actualPnl: 170 },
  { label: "Joint SPY $757P 0DTE (rd2)", entryPrice: 0.99, exitPrice: 1.0667, exitContracts: 3, entryTimeET: [10, 46], exitTimeET: [10, 49], day: 15, isZeroDTE: true, actualPnl: 23 },
  // The two real losses — held to near-expiry instead of exited earlier
  {
    label: "Investing SPY $756P 0DTE (LOSS)", entryPrice: 0.784, exitPrice: 0.13, exitContracts: 5,
    entryTimeET: [11, 1], exitTimeET: [15, 45], day: 15, isZeroDTE: true,
    knownCheckpoint: { timeET: [15, 42], mark: 0.235 },
    actualPnl: -327,
  },
  {
    label: "Joint SPY $756P 0DTE (LOSS)", entryPrice: 0.70, exitPrice: 0.13, exitContracts: 5,
    entryTimeET: [11, 1], exitTimeET: [15, 45], day: 15, isZeroDTE: true,
    knownCheckpoint: { timeET: [15, 42], mark: 0.235 },
    actualPnl: -285,
  },
  // Multi-day (non-0DTE) trades — no time pressure, included to confirm the
  // rule doesn't fire on them
  { label: "SPY $761C exp9/15 (1-day)", entryPrice: 1.86, exitPrice: 2.15, exitContracts: 15, entryTimeET: [10, 3], exitTimeET: [11, 27], day: 14, isZeroDTE: false, actualPnl: 360 },
  { label: "QQQ $706C exp9/15 (1-day)", entryPrice: 2.93, exitPrice: 3.87, exitContracts: 5, entryTimeET: [9, 56], exitTimeET: [10, 9], day: 14, isZeroDTE: false, actualPnl: 470 },
  { label: "PLTR $172.50C exp9/18", entryPrice: 3.55, exitPrice: 3.70, exitContracts: 5, entryTimeET: [11, 50], exitTimeET: [12, 3], day: 14, isZeroDTE: false, actualPnl: 75 },
  { label: "COIN $177.50P exp9/18 (rd1)", entryPrice: 5.00, exitPrice: 5.30, exitContracts: 4, entryTimeET: [10, 10], exitTimeET: [10, 21], day: 15, isZeroDTE: false, actualPnl: 115 },
  { label: "Joint MSTR $129P exp9/18 (rd1)", entryPrice: 3.60, exitPrice: 3.65, exitContracts: 1, entryTimeET: [10, 9], exitTimeET: [10, 46], day: 15, isZeroDTE: false, actualPnl: 5 },
  { label: "Investing QQQ $707P exp9/16", entryPrice: 3.61, exitPrice: 4.20, exitContracts: 1, entryTimeET: [10, 19], exitTimeET: [10, 22], day: 15, isZeroDTE: false, actualPnl: 59 },
  { label: "Investing MSTR $129P exp9/18 (rd2)", entryPrice: 3.95, exitPrice: 4.10, exitContracts: 2, entryTimeET: [10, 43], exitTimeET: [10, 46], day: 15, isZeroDTE: false, actualPnl: 30 },
  { label: "Investing COIN $175P exp9/18 (rd2)", entryPrice: 4.85, exitPrice: 5.00, exitContracts: 3, entryTimeET: [10, 56], exitTimeET: [10, 57], day: 15, isZeroDTE: false, actualPnl: 45 },
  { label: "Joint COIN $175P exp9/18 (rd2)", entryPrice: 4.80, exitPrice: 5.00, exitContracts: 1, entryTimeET: [10, 56], exitTimeET: [10, 57], day: 15, isZeroDTE: false, actualPnl: 20 },
];

let ruleWouldHaveFired = 0;
let ruleNoImpact = 0;
let totalActualPnl = 0;
let totalHypotheticalPnl = 0;

console.log("=".repeat(100));
console.log("EXIT STRATEGY BACKTEST — 19 tool-attributed trades, 2026-09-14/15");
console.log("=".repeat(100));

for (const trade of trades) {
  const entryTime = etTimestamp(trade.entryTimeET[0], trade.entryTimeET[1], trade.day);
  const naturalExitTime = etTimestamp(trade.exitTimeET[0], trade.exitTimeET[1], trade.day);

  // Simulate a check at the natural exit time using the actual exit price
  // as the mark (a reasonable proxy — the position was worth that at that
  // moment since that's when it was sold).
  const position: PositionState = {
    entryPrice: trade.entryPrice,
    currentMark: trade.exitPrice,
    peakMarkSinceEntry: Math.max(trade.entryPrice, trade.exitPrice),
    isZeroDTE: trade.isZeroDTE,
    entryTime,
    now: naturalExitTime,
  };

  const decisionAtNaturalExit = checkExitSignal(position);

  let hypotheticalPnl = trade.actualPnl;
  let note = "no change — exited naturally before any rule would fire";

  if (trade.knownCheckpoint) {
    // For the two known losses: check what the rule says at the 2:30 PM
    // time-stop, using the known checkpoint mark as the best available
    // proxy (conservative — actual 2:30 PM mark was likely still somewhat
    // higher, since theta accelerates closer to expiry).
    const timeStopMoment = etTimestamp(14, 30, trade.day);
    const checkpointPosition: PositionState = {
      entryPrice: trade.entryPrice,
      currentMark: trade.knownCheckpoint.mark,
      peakMarkSinceEntry: trade.entryPrice, // never went profitable
      isZeroDTE: true,
      entryTime,
      now: timeStopMoment,
    };
    const forcedExitDecision = checkExitSignal(checkpointPosition);
    if (forcedExitDecision.shouldExit) {
      hypotheticalPnl = (trade.knownCheckpoint.mark - trade.entryPrice) * trade.exitContracts * 100;
      note = `RULE FIRES at 2:30 PM (${forcedExitDecision.action}) — forced exit at known ~3:42 PM checkpoint mark $${trade.knownCheckpoint.mark} (conservative proxy; true 2:30 PM mark was likely still higher/better)`;
      ruleWouldHaveFired++;
    }
  } else if (decisionAtNaturalExit.shouldExit && naturalExitTime > etTimestamp(14, 30, trade.day)) {
    // Winner that happened to still be open past 2:30 PM — check if the
    // rule would have clipped it early. None in this dataset, but the
    // logic is here for completeness.
    ruleWouldHaveFired++;
    note = `Rule would have fired (${decisionAtNaturalExit.action}) at natural exit time — check for clipping`;
  } else {
    ruleNoImpact++;
  }

  totalActualPnl += trade.actualPnl;
  totalHypotheticalPnl += hypotheticalPnl;

  const changeMarker = hypotheticalPnl !== trade.actualPnl ? " *** CHANGED ***" : "";
  console.log(
    `${trade.label.padEnd(38)} actual: $${trade.actualPnl.toFixed(2).padStart(8)}  hypothetical: $${hypotheticalPnl.toFixed(2).padStart(8)}${changeMarker}`
  );
  if (hypotheticalPnl !== trade.actualPnl) {
    console.log(`  -> ${note}`);
  }
}

console.log("=".repeat(100));
console.log(`Trades where the new rule would have changed the outcome: ${ruleWouldHaveFired}`);
console.log(`Trades unaffected (exited naturally, no rule interference): ${ruleNoImpact}`);
console.log(`Actual total P&L:       $${totalActualPnl.toFixed(2)}`);
console.log(`Hypothetical total P&L: $${totalHypotheticalPnl.toFixed(2)}`);
console.log(`Improvement:            $${(totalHypotheticalPnl - totalActualPnl).toFixed(2)}`);
console.log("=".repeat(100));
console.log(
  "\nNote: the hypothetical improvement is a LOWER BOUND. It uses a ~3:42 PM mark price\n" +
  "as a proxy for the 2:30 PM forced-exit price on the two losing trades, since exact\n" +
  "2:30 PM marks weren't captured live. Theta decay accelerates as 0DTE options approach\n" +
  "expiry, so the true 2:30 PM mark was almost certainly higher (better) than 0.235 —\n" +
  "meaning the real improvement from enforcing this rule live would likely be larger\n" +
  "than what's shown here, not smaller."
);
