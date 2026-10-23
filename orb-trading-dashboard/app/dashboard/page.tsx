"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PriceChart } from "@/components/Chart/PriceChart";
import { aggregateCandles } from "@/lib/candle-aggregation";
import { PositionCard } from "@/components/PositionCard/PositionCard";
import { RiskLimitDisplay } from "@/components/RiskLimitDisplay/RiskLimitDisplay";
import { TradeSignalAlert } from "@/components/TradeSignalAlert/TradeSignalAlert";
import { useMarketData } from "@/hooks/useMarketData";
import { useTradeExecution } from "@/hooks/useTradeExecution";
import type { Trade, TradingSettings } from "@/types/trading";

const ACCOUNT_EQUITY_FALLBACK = 10000;

const PROFILES = [
  { id: "default", label: "Optimized (live)" },
  { id: "video-literal", label: "Video-literal" },
];

// Display-only chart aggregation — the underlying signal engine always
// detects breakouts/entries on native 5-min bars (the validated timeframe,
// see lib/orb-strategy.ts); this only changes how candles are visually
// bucketed on the chart, via lib/candle-aggregation.ts.
const TIMEFRAMES = [
  { label: "5m", minutes: 5 },
  { label: "10m", minutes: 10 },
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
];

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading…</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const profile = searchParams.get("profile") ?? "default";

  const [settings, setSettings] = useState<TradingSettings | null>(null);
  const [positions, setPositions] = useState<Trade[]>([]);
  const [riskCheck, setRiskCheck] = useState<{
    currentLossPct: number;
    limitPct: number;
    allowed: boolean;
    reason: string | null;
  } | null>(null);

  const symbol = searchParams.get("symbol") ?? settings?.symbols[0] ?? null;
  const { data, error, isLoading } = useMarketData(symbol, profile);
  const { execute, closePosition, isSubmitting } = useTradeExecution();
  const [timeframeMinutes, setTimeframeMinutes] = useState(5);

  const chartCandles =
    timeframeMinutes === 5
      ? data?.candles ?? []
      : aggregateCandles(data?.candles ?? [], timeframeMinutes * 60 * 1000);

  useEffect(() => {
    setSettings(null);
    fetch(`/api/settings?profile=${profile}`)
      .then((res) => res.json())
      .then((json) => json.success && setSettings(json.data));
  }, [profile]);

  useEffect(() => {
    refreshPositions();
    refreshRisk();
    const interval = setInterval(() => {
      refreshPositions();
      refreshRisk();
    }, 20000);
    return () => clearInterval(interval);
  }, [profile]);

  function refreshPositions() {
    fetch(`/api/trading/positions?profile=${profile}`)
      .then((res) => res.json())
      .then((json) => json.success && setPositions(json.data));
  }

  function refreshRisk() {
    fetch(`/api/risk/daily-limit?accountEquity=${ACCOUNT_EQUITY_FALLBACK}&profile=${profile}`)
      .then((res) => res.json())
      .then((json) => json.success && setRiskCheck(json.data.check));
  }

  async function handleExecute() {
    if (!symbol) return;
    const result = await execute(symbol, ACCOUNT_EQUITY_FALLBACK, profile);
    if (result) {
      refreshPositions();
      refreshRisk();
    }
  }

  async function handleClose(tradeId: string, exitPrice: number) {
    await closePosition(tradeId, exitPrice, profile);
    refreshPositions();
    refreshRisk();
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <div className="flex items-center gap-3">
          <a
            href={profile === "default" ? "/watchlist" : `/watchlist?profile=${profile}`}
            className="text-xs text-zinc-500 underline"
          >
            ← Full ticker list
          </a>
          {settings && (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Mode: {settings.mode}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {PROFILES.map((p) => (
          <a
            key={p.id}
            href={p.id === "default" ? "/dashboard" : `/dashboard?profile=${p.id}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              profile === p.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {p.label}
          </a>
        ))}
      </div>

      {!symbol && (
        <p className="mt-6 text-sm text-zinc-500">
          No symbols configured yet. Add one in{" "}
          <a href={profile === "default" ? "/settings" : `/settings?profile=${profile}`} className="underline">
            Settings
          </a>
          .
        </p>
      )}

      {symbol && (
        <>
          {data?.status === "DATA_UNAVAILABLE" && (
            <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              Data feed issue: {data.reason ?? "market data is currently unavailable."} Signals are paused
              until the feed recovers — this is not the same as "no signal formed."
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {riskCheck && (
              <RiskLimitDisplay
                currentLossPct={riskCheck.currentLossPct}
                limitPct={riskCheck.limitPct}
                allowed={riskCheck.allowed}
                reason={riskCheck.reason}
              />
            )}

            <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">{symbol}</div>
              {data?.quote && (
                <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  ${data.quote.price.toFixed(2)}
                </div>
              )}
              {isLoading && <div className="text-xs text-zinc-500">Loading…</div>}
              {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center gap-1">
              <span className="mr-1 text-xs text-zinc-500">Timeframe:</span>
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.minutes}
                  type="button"
                  onClick={() => setTimeframeMinutes(tf.minutes)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    timeframeMinutes === tf.minutes
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <PriceChart
              candles={chartCandles}
              openingRange={data?.openingRange ?? null}
              breakoutDirection={data?.breakout?.direction ?? null}
            />
          </div>

          {data?.entry && (
            <div className="mt-6">
              <TradeSignalAlert entry={data.entry} />
              {settings?.mode === "PAPER" && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleExecute}
                  className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {isSubmitting ? "Submitting…" : "Take this trade (paper)"}
                </button>
              )}
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Open positions ({positions.length})
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {positions.map((trade) => (
                <PositionCard
                  key={trade.id}
                  trade={trade}
                  currentPrice={data?.quote?.symbol === trade.symbol ? data.quote.price : undefined}
                  onClose={handleClose}
                  isClosing={isSubmitting}
                />
              ))}
              {positions.length === 0 && (
                <p className="text-xs text-zinc-500">No open positions.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
