"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PriceChart } from "@/components/Chart/PriceChart";
import type { Candle, EntrySignal, ORBSignal, OpeningRange, TradingSettings } from "@/types/trading";

const PROFILES = [
  { id: "default", label: "Optimized (live)" },
  { id: "continuation", label: "Continuation" },
  { id: "flag", label: "Flag" },
  { id: "video-literal", label: "Video-literal" },
];

const POLL_INTERVAL_MS = 60_000;

interface SignalResponse {
  status: "DATA_UNAVAILABLE" | "NO_SIGNAL" | "SIGNAL";
  reason?: string;
  openingRange: OpeningRange | null;
  breakout: ORBSignal | null;
  entry: EntrySignal | null;
  quote?: { symbol: string; price: number; timestamp: number };
  candles: Candle[];
}

interface TickerState {
  symbol: string;
  data: SignalResponse | null;
  error: string | null;
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading…</div>}>
      <WatchlistContent />
    </Suspense>
  );
}

function WatchlistContent() {
  const searchParams = useSearchParams();
  const profile = searchParams.get("profile") ?? "default";

  const [settings, setSettings] = useState<TradingSettings | null>(null);
  const [tickers, setTickers] = useState<TickerState[]>([]);

  useEffect(() => {
    setSettings(null);
    fetch(`/api/settings?profile=${profile}`)
      .then((res) => res.json())
      .then((json) => json.success && setSettings(json.data));
  }, [profile]);

  useEffect(() => {
    if (!settings) return;

    let cancelled = false;

    async function fetchAll() {
      const results = await Promise.all(
        settings!.symbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/trading/signal?symbol=${symbol}&profile=${profile}`);
            const json = await res.json();
            if (!json.success) {
              return { symbol, data: null, error: json.error ?? "Request failed" };
            }
            return { symbol, data: json.data as SignalResponse, error: null };
          } catch {
            return { symbol, data: null, error: "Network error" };
          }
        }),
      );
      if (!cancelled) setTickers(results);
    }

    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [settings, profile]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Watchlist</h1>
        <a href="/dashboard" className="text-xs text-zinc-500 underline">
          Single-symbol view →
        </a>
      </div>

      <div className="mt-4 flex gap-2">
        {PROFILES.map((p) => (
          <a
            key={p.id}
            href={p.id === "default" ? "/watchlist" : `/watchlist?profile=${p.id}`}
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

      <p className="mt-3 text-xs text-zinc-500">
        Amber band marks the opening-range candle (15 min for most symbols; 30 min for symbols on a wide
        opening range, e.g. QQQ). Green/red dashed lines are the ORB high/low.
      </p>

      {!settings && <p className="mt-6 text-sm text-zinc-500">Loading settings…</p>}

      {settings && settings.symbols.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500">
          No symbols configured. Add some in{" "}
          <a href={profile === "default" ? "/settings" : `/settings?profile=${profile}`} className="underline">
            Settings
          </a>
          .
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tickers.map(({ symbol, data, error }) => (
          <a
            key={symbol}
            href={`/dashboard?symbol=${symbol}&profile=${profile}`}
            className="block rounded-md border border-zinc-200 p-3 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{symbol}</span>
              {data?.quote && (
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  ${data.quote.price.toFixed(2)}
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
              {data?.status === "SIGNAL" && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  {data.entry?.direction ?? data.breakout?.direction} signal
                </span>
              )}
              {data?.status === "NO_SIGNAL" && <span>No signal</span>}
              {data?.status === "DATA_UNAVAILABLE" && (
                <span className="text-amber-600 dark:text-amber-400">Data unavailable</span>
              )}
              {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
              {!data && !error && <span>Loading…</span>}
            </div>

            <div className="mt-2">
              <PriceChart
                candles={data?.candles ?? []}
                openingRange={data?.openingRange ?? null}
                breakoutDirection={data?.breakout?.direction ?? null}
                compact
              />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
