import type { EntrySignal } from "@/types/trading";

// Beyond this favorable-drift threshold, entering now means paying up
// meaningfully versus the trigger price — worse risk/reward than the signal
// implied. Derived from live observation 2026-09-14: a $2.82 (0.37%) drift
// on SPY was flagged as "chasing" by manual inspection.
const CHASING_THRESHOLD_PCT = 0.25;

export type FreshnessLabel = "FRESH" | "CHASING" | "STALE";

export interface SignalFreshness {
  /** Signed distance in dollars: positive = price moved further in the
   * signal's favor since it fired; negative = price moved against the thesis. */
  distanceFromTriggerUsd: number;
  distanceFromTriggerPct: number;
  ageMinutes: number;
  /** Price has moved against the entry direction — the original thesis is
   * being invalidated by price action, not just aging. */
  isStale: boolean;
  /** Price has run away in the favorable direction — entering now chases
   * a worse price than the signal's trigger. */
  isChasing: boolean;
  label: FreshnessLabel;
}

export function calculateSignalFreshness(
  entry: EntrySignal,
  currentPrice: number,
  now: number,
): SignalFreshness {
  const rawDelta = currentPrice - entry.price;
  // For BULLISH, price rising is favorable (positive drift). For BEARISH,
  // price falling is favorable — flip the sign so "positive" always means
  // "moving further in the direction the trade wants."
  const distanceFromTriggerUsd = entry.direction === "BULLISH" ? rawDelta : -rawDelta;
  const distanceFromTriggerPct = (distanceFromTriggerUsd / entry.price) * 100;

  const ageMinutes = (now - entry.detectedAt) / 60000;

  const isStale = distanceFromTriggerUsd < 0;
  const isChasing = !isStale && distanceFromTriggerPct > CHASING_THRESHOLD_PCT;

  const label: FreshnessLabel = isStale ? "STALE" : isChasing ? "CHASING" : "FRESH";

  return {
    distanceFromTriggerUsd,
    distanceFromTriggerPct,
    ageMinutes,
    isStale,
    isChasing,
    label,
  };
}
