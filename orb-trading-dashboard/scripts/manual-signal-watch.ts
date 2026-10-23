/**
 * Fallback signal watcher for days when the live feed has a gap in the
 * 9:30-9:45 ET opening-range candles (recurring Twelve Data issue — see
 * project memory). Takes a manually-confirmed opening range (read off the
 * user's own broker chart) and replays the real strategy logic against it,
 * persisting which entries have already been surfaced so it only reports
 * genuinely NEW entry points, not the same one over and over.
 *
 * Usage: npx tsx scripts/manual-signal-watch.ts <rangeHigh> <rangeLow>
 * Exits 0 always; prints NEW_ENTRY lines for anything not seen before.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { getEasternDateString } from "../lib/market-hours";
import { detectBreakout, getEntrySignal } from "../lib/orb-strategy";
import type { Candle, EntrySignal, TradingSettings, OpeningRange } from "../types/trading";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const symbol = "SPY";
const rangeHigh = parseFloat(process.argv[2]);
const rangeLow = parseFloat(process.argv[3]);

if (Number.isNaN(rangeHigh) || Number.isNaN(rangeLow)) {
  console.error("Usage: npx tsx scripts/manual-signal-watch.ts <rangeHigh> <rangeLow>");
  process.exit(1);
}

const PROFILES: Record<string, TradingSettings> = {
  default: {
    userId: "default", mode: "ALERTS", symbols: [symbol], dailyLossLimitPct: 2, riskPerTradePct: 1,
    maxOpenPositions: 1, riskRewardRatio: 3, stopLossBufferPct: 0, maxConsecutiveLosses: 3,
    maxTradePerOrderUsd: 8000, maxDailySpendUsd: 8000,
    fibonacciAnchorMode: "BREAKOUT_LEG", entryTypeFilter: "FIBONACCI_ONLY", maxHoldMinutes: 40, useElevenAmSwitch: false, requireHighQualityBreakout: false,
  },
  "video-literal": {
    userId: "video-literal", mode: "ALERTS", symbols: [symbol], dailyLossLimitPct: 2, riskPerTradePct: 1,
    maxOpenPositions: 1, riskRewardRatio: 3, stopLossBufferPct: 0, maxConsecutiveLosses: 3,
    maxTradePerOrderUsd: 8000, maxDailySpendUsd: 8000,
    fibonacciAnchorMode: "OPENING_RANGE", entryTypeFilter: "ANY", maxHoldMinutes: 40, useElevenAmSwitch: false, requireHighQualityBreakout: false,
  },
};

function fmtEt(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
}

const STATE_PATH = join(__dirname, "..", ".manual-signal-watch-state.json");

interface WatchState {
  date: string;
  // profileName -> entry type that was active on the previous run (or null).
  // RETEST is "sticky" once triggered (stays true for the rest of the day),
  // so this must be transition-based (off->on), not price-based — otherwise
  // a RETEST entry would falsely look "new" every time price keeps drifting
  // and getEntrySignal recomputes `price` off the latest candle's close.
  lastActiveType: Record<string, string | null>;
}

function loadState(today: string): WatchState {
  if (existsSync(STATE_PATH)) {
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as WatchState;
    if (raw.date === today) return raw;
  }
  return { date: today, lastActiveType: {} };
}

function saveState(state: WatchState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  const client = createMarketDataClientFromEnv();
  const recentCandles = await client.getHistoricals(symbol, "5min", 100);
  const now = Date.now();
  const today = getEasternDateString(now);
  const todayCandles = recentCandles
    .filter((c) => getEasternDateString(c.timestamp) === today)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (todayCandles.length === 0) {
    console.log("NO_DATA: no candles for today yet.");
    return;
  }

  const openingRange: OpeningRange = {
    symbol,
    date: today,
    high: rangeHigh,
    low: rangeLow,
    formedAt: todayCandles[0].timestamp - 5 * 60_000,
  };

  const candlesAfterRange = todayCandles.filter((c) => c.timestamp >= openingRange.formedAt);
  const breakout = candlesAfterRange.reduce<ReturnType<typeof detectBreakout>>((found, c) => {
    if (found) return found;
    return detectBreakout(openingRange, c.close, c.timestamp);
  }, null);

  if (!breakout) {
    console.log("NO_BREAKOUT: price still inside the manual range.");
    return;
  }

  const state = loadState(today);
  let anyNew = false;

  for (const [profileName, settings] of Object.entries(PROFILES)) {
    const entry = getEntrySignal(breakout, candlesAfterRange, settings);
    const lastType = state.lastActiveType[profileName] ?? null;
    const currentType = entry ? entry.type : null;

    // Only report on an off->on (or type-changed) transition — a RETEST
    // entry is sticky for the rest of the day, so re-seeing "RETEST" every
    // cycle is the SAME signal continuing, not a new one. A FIBONACCI entry
    // can toggle off and back on as price re-enters the zone; each fresh
    // on-transition is a genuinely new entry point.
    if (entry && currentType !== lastType) {
      anyNew = true;
      console.log(
        `NEW_ENTRY profile=${profileName} type=${entry.type} direction=${entry.direction} ` +
          `price=${entry.price.toFixed(2)} stop=${entry.stopLoss.toFixed(2)} target=${entry.takeProfit.toFixed(2)} ` +
          `at=${fmtEt(entry.detectedAt)}ET`,
      );
    }
    state.lastActiveType[profileName] = currentType;
  }

  saveState(state);
  if (!anyNew) console.log("NO_NEW_ENTRY: no fresh entry since last check.");
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
