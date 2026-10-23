/**
 * Compares FIBONACCI_ONLY, full-year, EOD exit, WITH vs WITHOUT the new
 * requireHighQualityBreakout gate (relative volume + intraday ATR on the
 * breakout candle itself) — to check whether it's actually worth turning on
 * live, per symbol.
 *
 * Usage: npx tsx scripts/backtest-quality-breakout.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { runBacktest } from "../lib/backtest-engine";
import type { Candle, TradingSettings } from "../types/trading";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const symbol = process.argv[2] ?? "SPY";
const TARGET_DAYS = 365;
const API_KEY = process.env.TWELVE_DATA_API_KEY;

interface RawValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function toCandle(v: RawValue): Candle {
  return {
    timestamp: Date.parse(`${v.datetime.replace(" ", "T")}Z`),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseInt(v.volume, 10),
  };
}

async function fetchChunk(endDate: string | null): Promise<RawValue[]> {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "5min");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", API_KEY as string);
  if (endDate) url.searchParams.set("end_date", endDate);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status === "error") throw new Error(`Twelve Data error: ${json.message}`);
  return json.values ?? [];
}

async function fetchFullYear(): Promise<Candle[]> {
  const allValues: RawValue[] = [];
  let endDate: string | null = null;
  const cutoff = Date.now() - TARGET_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 0; i < 8; i++) {
    console.log(`  Fetching chunk ${i + 1} (end_date=${endDate ?? "latest"})...`);
    const chunk = await fetchChunk(endDate);
    if (chunk.length === 0) break;
    allValues.push(...chunk);
    const oldest = chunk[chunk.length - 1].datetime;
    const oldestMs = Date.parse(`${oldest.replace(" ", "T")}Z`);
    if (oldestMs <= cutoff) break;
    endDate = new Date(oldestMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await new Promise((r) => setTimeout(r, 8000));
  }

  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (const v of allValues) {
    const c = toCandle(v);
    if (!seen.has(c.timestamp)) {
      seen.add(c.timestamp);
      candles.push(c);
    }
  }
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const baseSettings: TradingSettings = { ...(await settingsRes.json()).data, entryTypeFilter: "FIBONACCI_ONLY" };

  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...\n`);
  const candles = await fetchFullYear();
  console.log(`\nAssembled ${candles.length} candles\n`);

  const withoutFilter = runBacktest({
    symbol,
    candles,
    settings: { ...baseSettings, requireHighQualityBreakout: false },
    startingEquity: 10000,
  });
  const withFilter = runBacktest({
    symbol,
    candles,
    settings: { ...baseSettings, requireHighQualityBreakout: true },
    startingEquity: 10000,
  });

  console.log(`=== ${symbol} — requireHighQualityBreakout comparison, FIBONACCI_ONLY, EOD exit ===\n`);
  console.log("filter".padEnd(14), "trades".padEnd(8), "wins".padEnd(6), "losses".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(11), "avgPnl");
  for (const [label, r] of [["off (live)", withoutFilter], ["on (quality)", withFilter]] as const) {
    console.log(
      label.padEnd(14),
      String(r.totalTrades).padEnd(8),
      String(r.wins).padEnd(6),
      String(r.losses).padEnd(8),
      (r.winRate.toFixed(1) + "%").padEnd(9),
      ("$" + r.totalPnl.toFixed(2)).padEnd(11),
      "$" + r.avgProfitPerTrade.toFixed(2),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
