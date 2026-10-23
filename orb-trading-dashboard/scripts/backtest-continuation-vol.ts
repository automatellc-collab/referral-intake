/**
 * Backtest the volume-confirmed CONTINUATION_VOL_ONLY variant across the
 * full watchlist (best hold-bar per symbol), to compare against the plain
 * CONTINUATION_ONLY results already captured.
 *
 * Usage: npx tsx scripts/backtest-continuation-vol.ts
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
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}
loadEnvLocal();

const WATCHLIST = ["SPY", "QQQ", "TSLA", "CRWD", "NVDA", "AMD", "PLTR", "COIN", "MSTR", "AVGO"];
const HOLD_BAR_OPTIONS = [undefined, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30];
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

async function fetchChunk(symbol: string, endDate: string | null): Promise<RawValue[]> {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "5min");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", API_KEY as string);
  if (endDate) {
    url.searchParams.set("end_date", endDate);
  }

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status === "error") {
    throw new Error(`Twelve Data error (${symbol}): ${json.message}`);
  }
  return json.values ?? [];
}

async function fetchFullYear(symbol: string): Promise<Candle[]> {
  const allValues: RawValue[] = [];
  let endDate: string | null = null;
  const startTime = Date.now();
  const cutoff = startTime - TARGET_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 0; i < 8; i++) {
    const chunk = await fetchChunk(symbol, endDate);
    if (chunk.length === 0) break;

    allValues.push(...chunk);
    const oldest = chunk[chunk.length - 1].datetime;
    const oldestMs = Date.parse(`${oldest.replace(" ", "T")}Z`);

    if (oldestMs <= cutoff) break;

    const prevDay = new Date(oldestMs - 24 * 60 * 60 * 1000);
    endDate = prevDay.toISOString().slice(0, 10);

    await new Promise((resolve) => setTimeout(resolve, 8000));
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
  const settingsJson = await settingsRes.json();
  const baseSettings: TradingSettings = settingsJson.data;

  console.log("symbol".padEnd(8), "bestHold".padEnd(10), "trades".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(11), "avgPnl");

  for (const symbol of WATCHLIST) {
    try {
      const candles = await fetchFullYear(symbol);
      if (candles.length === 0) {
        console.log(symbol.padEnd(8), "no data returned");
        continue;
      }

      let best = { bars: "EOD", winRate: -1, totalPnl: -Infinity, trades: 0 };
      for (const bars of HOLD_BAR_OPTIONS) {
        const settings = { ...baseSettings, entryTypeFilter: "CONTINUATION_VOL_ONLY" as const };
        const result = runBacktest({ symbol, candles, settings, startingEquity: 10000, maxHoldBars: bars });
        if (result.totalTrades >= 20 && result.totalPnl > best.totalPnl) {
          best = { bars: String(bars ?? "EOD"), winRate: result.winRate, totalPnl: result.totalPnl, trades: result.totalTrades };
        }
      }
      console.log(
        symbol.padEnd(8),
        best.bars.padEnd(10),
        String(best.trades).padEnd(8),
        (best.winRate.toFixed(1) + "%").padEnd(9),
        ("$" + best.totalPnl.toFixed(2)).padEnd(11),
        best.trades > 0 ? "$" + (best.totalPnl / best.trades).toFixed(2) : "n/a (<20 trades at any hold)",
      );
    } catch (err) {
      console.log(symbol.padEnd(8), "ERROR:", err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
