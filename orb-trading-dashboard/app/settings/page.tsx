"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EntryTypeFilter, FibonacciAnchorMode, TradingMode, TradingSettings } from "@/types/trading";

const PROFILES = [
  { id: "default", label: "Optimized (live)" },
  { id: "video-literal", label: "Video-literal" },
];

const MODE_DESCRIPTIONS: Record<TradingMode, string> = {
  PAPER: "Simulated trades only — no real orders, tracked in the local database.",
  ALERTS: "Notifies you when an entry signal fires. You place the trade manually.",
  AUTOMATED: "Not implemented — this app does not place live orders. Selecting this mode will always block trades with a clear reason.",
};

const FIB_ANCHOR_DESCRIPTIONS: Record<FibonacciAnchorMode, string> = {
  OPENING_RANGE: "Retrace the fixed 9:30–9:45 opening range itself (low to high).",
  BREAKOUT_LEG: "Retrace from the ORB level to the swing high/low reached after breakout — tracks the actual move instead of a fixed range.",
};

const ENTRY_TYPE_DESCRIPTIONS: Record<EntryTypeFilter, string> = {
  ANY: "Take either a retest rejection or a Fibonacci pullback — whichever fires first.",
  RETEST_ONLY: "Only enter on a retest rejection at the ORB level.",
  FIBONACCI_ONLY: "Only enter on a Fibonacci pullback. Backtesting on SPY showed this alone outperforming retest entries.",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading…</div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const profile = searchParams.get("profile") ?? "default";

  const [settings, setSettings] = useState<TradingSettings | null>(null);
  const [symbolsInput, setSymbolsInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setSettings(null);
    fetch(`/api/settings?profile=${profile}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSettings(json.data);
          setSymbolsInput(json.data.symbols.join(", "));
        }
      });
  }, [profile]);

  async function save() {
    if (!settings) return;
    setIsSaving(true);
    const symbols = symbolsInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 3);

    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, symbols, profile }),
    });
    const json = await res.json();
    if (json.success) {
      setSettings(json.data);
      setSavedAt(Date.now());
    }
    setIsSaving(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Trading settings</h1>

      <div className="mt-4 flex gap-2">
        {PROFILES.map((p) => (
          <a
            key={p.id}
            href={p.id === "default" ? "/settings" : `/settings?profile=${p.id}`}
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

      {!settings && <p className="mt-6 text-sm text-zinc-500">Loading settings…</p>}

      {settings && (
        <div className="mt-6 space-y-6">
          <fieldset>
            <legend className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Mode</legend>
            <div className="mt-2 space-y-2">
              {(Object.keys(MODE_DESCRIPTIONS) as TradingMode[]).map((mode) => (
                <label
                  key={mode}
                  className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={settings.mode === mode}
                    onChange={() => setSettings({ ...settings, mode })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{mode}</span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">{MODE_DESCRIPTIONS[mode]}</p>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Symbols to monitor (max 3)
            </label>
            <input
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              placeholder="SPY, QQQ"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Fibonacci fallback entry — retrace from
            </legend>
            <div className="mt-2 space-y-2">
              {(Object.keys(FIB_ANCHOR_DESCRIPTIONS) as FibonacciAnchorMode[]).map((mode) => (
                <label
                  key={mode}
                  className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <input
                    type="radio"
                    name="fibonacciAnchorMode"
                    checked={settings.fibonacciAnchorMode === mode}
                    onChange={() => setSettings({ ...settings, fibonacciAnchorMode: mode })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{mode}</span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">{FIB_ANCHOR_DESCRIPTIONS[mode]}</p>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Entry types allowed
            </legend>
            <div className="mt-2 space-y-2">
              {(Object.keys(ENTRY_TYPE_DESCRIPTIONS) as EntryTypeFilter[]).map((filter) => (
                <label
                  key={filter}
                  className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <input
                    type="radio"
                    name="entryTypeFilter"
                    checked={settings.entryTypeFilter === filter}
                    onChange={() => setSettings({ ...settings, entryTypeFilter: filter })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{filter}</span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">{ENTRY_TYPE_DESCRIPTIONS[filter]}</p>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              <input
                type="checkbox"
                checked={settings.maxHoldMinutes !== null}
                onChange={(e) =>
                  setSettings({ ...settings, maxHoldMinutes: e.target.checked ? 10 : null })
                }
              />
              Force-close trades after a max hold time
            </label>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Instead of riding to end of day. Backtesting found a short hold (~10 min) maximized win rate.
            </p>
            {settings.maxHoldMinutes !== null && (
              <input
                type="number"
                value={settings.maxHoldMinutes}
                onChange={(e) => setSettings({ ...settings, maxHoldMinutes: Number(e.target.value) })}
                className="mt-2 w-32 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Daily loss limit %"
              value={settings.dailyLossLimitPct}
              onChange={(v) => setSettings({ ...settings, dailyLossLimitPct: v })}
            />
            <NumberField
              label="Risk per trade %"
              value={settings.riskPerTradePct}
              onChange={(v) => setSettings({ ...settings, riskPerTradePct: v })}
            />
            <NumberField
              label="Risk:Reward ratio"
              value={settings.riskRewardRatio}
              onChange={(v) => setSettings({ ...settings, riskRewardRatio: v })}
            />
            <NumberField
              label="Max open positions"
              value={settings.maxOpenPositions}
              onChange={(v) => setSettings({ ...settings, maxOpenPositions: v })}
            />
            <NumberField
              label="Max consecutive losses"
              value={settings.maxConsecutiveLosses}
              onChange={(v) => setSettings({ ...settings, maxConsecutiveLosses: v })}
            />
            <NumberField
              label="Max $ per order"
              value={settings.maxTradePerOrderUsd}
              onChange={(v) => setSettings({ ...settings, maxTradePerOrderUsd: v })}
            />
          </div>

          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isSaving ? "Saving…" : "Save settings"}
          </button>
          {savedAt && <span className="ml-3 text-xs text-emerald-600">Saved</span>}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
    </div>
  );
}
