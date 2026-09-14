"use client";

import { useState } from "react";
import type { BacktestResult } from "@/lib/backtest-engine";

export default function BacktestPage() {
  const [symbol, setSymbol] = useState("SPY");
  const [outputsize, setOutputsize] = useState(780);
  const [startingEquity, setStartingEquity] = useState(10000);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function run() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, outputsize, startingEquity }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Backtest failed");
      } else {
        setResult(json.data);
      }
    } catch {
      setError("Network error running backtest");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Backtest</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Runs the ORB strategy over historical 5-minute candles for a symbol, fetched from
        Yahoo Finance (no API key needed). Limited to the last ~59 days — for a full-year
        backtest, use `scripts/backtest-full-year.ts` instead (still uses Twelve Data).
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Symbol</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Lookback</label>
          <select
            value={outputsize}
            onChange={(e) => setOutputsize(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value={390}>~1 week</option>
            <option value={780}>~2 weeks</option>
            <option value={1690}>~1 month</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Starting equity
          </label>
          <input
            type="number"
            value={startingEquity}
            onChange={(e) => setStartingEquity(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={isRunning}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isRunning ? "Running…" : "Run backtest"}
      </button>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-8">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Total trades" value={result.totalTrades.toString()} />
            <Stat label="Win rate" value={`${result.winRate.toFixed(1)}%`} />
            <Stat
              label="Total P&L"
              value={`${result.totalPnl >= 0 ? "+" : ""}$${result.totalPnl.toFixed(2)}`}
            />
            <Stat
              label="Avg profit/trade"
              value={`$${result.avgProfitPerTrade.toFixed(2)}`}
            />
            <Stat label="Max drawdown" value={`${result.maxDrawdownPct.toFixed(1)}%`} />
            <Stat label="Ending equity" value={`$${result.endingEquity.toFixed(2)}`} />
          </div>

          <table className="mt-6 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <th className="py-2">Date</th>
                <th>Dir</th>
                <th>Type</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.map((t, i) => (
                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5">{t.date}</td>
                  <td>{t.direction}</td>
                  <td>{t.entryType}</td>
                  <td>${t.entryPrice.toFixed(2)}</td>
                  <td>${t.exitPrice.toFixed(2)}</td>
                  <td className={t.pnl >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {t.pnl >= 0 ? "+" : ""}
                    {t.pnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}
