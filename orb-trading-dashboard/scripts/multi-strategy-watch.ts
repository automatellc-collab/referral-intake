/**
 * Live watcher for the four additional intraday strategies (VWAP reversion,
 * gap-fill fade, RSI(2) reversion, opening volume-spike continuation).
 *
 * NONE of these are backtest-validated yet — unlike ORB and the SMA-200
 * rejection strategy, which earned "worth trading" status through an actual
 * A/B backtest against real historical data. Every alert from this script
 * is informational until that validation happens. Do not treat these as
 * more trustworthy than they are just because they're now live.
 *
 * Runs starting right after the opening 5-min candle closes (9:35 AM ET) —
 * gap-fade fires off that first candle's open vs. yesterday's close;
 * volume-spike needs that first candle's own volume vs. a trailing average;
 * VWAP/RSI(2) build up their own history as the day's candles accumulate.
 *
 * Usage: npx tsx scripts/multi-strategy-watch.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { getEasternDateString, isWithinOpeningRangeWindow } from "../lib/market-hours";
import {
  detectVwapReversion,
  detectGapFade,
  detectRsi2Reversion,
  detectOpeningVolumeSpike,
  detectMarubozu,
  type MultiStrategySignal,
} from "../lib/multi-strategy-signals";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const WATCHLIST = ["SPY", "QQQ", "TSLA", "CRWD", "NVDA", "AMD", "PLTR", "COIN", "META", "AVGO"];

const STATE_PATH = join(__dirname, "..", ".multi-strategy-watch-state.json");

interface WatchState {
  // Keyed by `${symbol}__${strategy}` — the last date+price this exact
  // signal was reported for, so a still-active signal doesn't re-alert
  // every cycle while price hasn't moved meaningfully.
  [key: string]: { date: string; price: number };
}

function loadState(): WatchState {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

function saveState(state: WatchState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function isNewSignal(state: WatchState, symbol: string, signal: MultiStrategySignal, today: string): boolean {
  const key = `${symbol}__${signal.strategy}`;
  const prior = state[key];
  if (!prior || prior.date !== today) return true;
  const movedPct = Math.abs((signal.price - prior.price) / prior.price) * 100;
  return movedPct > 0.15; // re-alert only if price has moved meaningfully since the last alert
}

async function main() {
  const client = createMarketDataClientFromEnv();
  const state = loadState();
  const now = Date.now();
  const today = getEasternDateString(now);

  if (isWithinOpeningRangeWindow(now)) {
    console.log("SKIPPED: still inside the 9:30-9:45 opening-range window — wait for the first candle to close.");
    return;
  }

  const results: string[] = [];

  for (const symbol of WATCHLIST) {
    const [dailyCandles, intradayCandles] = await Promise.all([
      client.getHistoricals(symbol, "1day", 30),
      client.getHistoricals(symbol, "5min", 100),
    ]);

    const todayCandles = intradayCandles
      .filter((c) => getEasternDateString(c.timestamp) === today)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (todayCandles.length === 0) {
      continue;
    }

    const signals: MultiStrategySignal[] = [];

    const vwapSignal = detectVwapReversion(todayCandles);
    if (vwapSignal) signals.push(vwapSignal);

    const priorDaily = dailyCandles.filter((c) => getEasternDateString(c.timestamp) !== today);
    const previousClose = priorDaily.length > 0 ? priorDaily[priorDaily.length - 1].close : null;
    if (previousClose !== null) {
      const openingCandle = todayCandles[0];
      const gapSignal = detectGapFade(openingCandle.open, previousClose, openingCandle.timestamp);
      if (gapSignal) signals.push(gapSignal);

      // Average opening 5-min volume across the prior ~10 sessions, using
      // this symbol's own recent daily volume / (regular session minutes /
      // 5) as a proxy — a real per-session opening-candle average would
      // need per-day intraday history, which the client doesn't expose in
      // bulk here.
      const recentDaily = priorDaily.slice(-10);
      if (recentDaily.length > 0) {
        const avgDailyVolume =
          recentDaily.reduce((sum, c) => sum + c.volume, 0) / recentDaily.length;
        const avgOpeningVolumeProxy = avgDailyVolume / 78; // ~78 five-minute bars in a 6.5h session
        const volumeSpikeSignal = detectOpeningVolumeSpike(openingCandle, avgOpeningVolumeProxy);
        if (volumeSpikeSignal) signals.push(volumeSpikeSignal);
      }
    }

    const rsiSignal = detectRsi2Reversion(todayCandles);
    if (rsiSignal) signals.push(rsiSignal);

    const marubozuSignal = detectMarubozu(todayCandles[todayCandles.length - 1]);
    if (marubozuSignal) signals.push(marubozuSignal);

    for (const signal of signals) {
      if (isNewSignal(state, symbol, signal, today)) {
        results.push(
          `${symbol} — ${signal.strategy} — ${signal.direction} @ $${signal.price.toFixed(2)} — recommended hold ~${signal.recommendedHoldMinutes} min — ${signal.reason}`,
        );
        state[`${symbol}__${signal.strategy}`] = { date: today, price: signal.price };
      }
    }
  }

  saveState(state);

  if (results.length === 0) {
    console.log("NO_NEW_SIGNAL: nothing new across the watchlist.");
    return;
  }

  console.log(results.join("\n"));
}

main().catch((err) => {
  console.error("multi-strategy-watch failed:", err);
  process.exit(1);
});
