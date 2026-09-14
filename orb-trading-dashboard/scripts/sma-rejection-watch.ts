/**
 * Second alert set: 200-day SMA rejection plays across the Magnificent 7.
 * For each symbol, computes the 200-day SMA from daily closes, then checks
 * the latest 5-min candle for a rejection off that level (see
 * lib/sma-rejection-strategy.ts). Persists per-symbol state so it only
 * reports a genuinely NEW rejection, not the same one repeating.
 *
 * BEARISH-only by design: a YTD backtest (scripts/sma-rejection-backtest.ts)
 * showed BULLISH rejections barely broke even (22.2% win rate, +$1.61/share
 * combined across 27 trades — essentially noise) while BEARISH rejections
 * had real edge (50.0% win rate, +$37.89/share across 24 trades). The video
 * this was sourced from claimed the pattern works symmetrically in both
 * directions; the data says otherwise. Also held to end of day (no
 * maxHoldMinutes cap) — the same backtest found capping the hold time
 * (tried 15/30/40/60/90 min) reduced total P&L in every case versus letting
 * winners run, the opposite of what worked for the ORB strategy's 40-min
 * rule.
 *
 * Usage: npx tsx scripts/sma-rejection-watch.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { getEasternDateString } from "../lib/market-hours";
import { calculateSMA, detectSMARejection } from "../lib/sma-rejection-strategy";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const MAG_7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];
const SMA_PERIOD = 200;

const STATE_PATH = join(__dirname, "..", ".sma-rejection-watch-state.json");

interface WatchState {
  date: string;
  // symbol -> the detectedAt timestamp of the last rejection reported, so
  // a later, different-timestamp rejection on the same symbol still
  // counts as new, but re-seeing the identical one doesn't.
  lastReportedAt: Record<string, number | null>;
}

function loadState(today: string): WatchState {
  if (existsSync(STATE_PATH)) {
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as WatchState;
    if (raw.date === today) return raw;
  }
  return { date: today, lastReportedAt: {} };
}

function saveState(state: WatchState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  const client = createMarketDataClientFromEnv();
  const today = getEasternDateString(Date.now());
  const state = loadState(today);
  let anyNew = false;

  for (const symbol of MAG_7) {
    const [dailyCandles, intradayCandles] = await Promise.all([
      client.getHistoricals(symbol, "1day", SMA_PERIOD + 10),
      client.getHistoricals(symbol, "5min", 10),
    ]);

    if (dailyCandles.length < SMA_PERIOD) {
      console.log(`${symbol}: SKIP — only ${dailyCandles.length} daily closes, need ${SMA_PERIOD}`);
      continue;
    }
    const latestIntraday = intradayCandles[intradayCandles.length - 1];
    if (!latestIntraday) {
      console.log(`${symbol}: SKIP — no intraday candles`);
      continue;
    }

    const sma200 = calculateSMA(
      dailyCandles.map((c) => c.close),
      SMA_PERIOD,
    );
    const signal = detectSMARejection(latestIntraday, sma200);

    // BULLISH rejections backtested as essentially noise (22.2% win rate,
    // near-breakeven) — see the file header. Only BEARISH has real edge.
    if (!signal || signal.direction !== "BEARISH") continue;

    const lastReported = state.lastReportedAt[symbol] ?? null;
    if (lastReported === signal.detectedAt) continue; // same rejection already surfaced

    anyNew = true;
    state.lastReportedAt[symbol] = signal.detectedAt;
    console.log(
      `NEW_REJECTION symbol=${symbol} direction=${signal.direction} price=${signal.price.toFixed(2)} ` +
        `stop=${signal.stopLoss.toFixed(2)} target=${signal.takeProfit.toFixed(2)} sma200=${sma200.toFixed(2)}`,
    );
  }

  saveState(state);
  if (!anyNew) console.log("NO_NEW_REJECTION: nothing new across the Mag 7.");
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
