"use client";

import { useCallback, useState } from "react";
import type { CardInsightGradeInput, CardInsightResult } from "@/lib/insightTypes";

interface MarketValueEstimateProps {
  getFrontImageBase64: () => string;
  grade: CardInsightGradeInput;
  onApplySurfaceAssessment: (score: number, note: string) => void;
}

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; result: CardInsightResult };

export function MarketValueEstimate({ getFrontImageBase64, grade, onApplySurfaceAssessment }: MarketValueEstimateProps) {
  const [state, setState] = useState<RequestState>({ status: "idle" });

  const runEstimate = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/card-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImageBase64: getFrontImageBase64(), grade }),
      });
      const data = await response.json();
      if (!response.ok) {
        setState({ status: "error", message: data.error ?? "Something went wrong." });
        return;
      }
      setState({ status: "success", result: data as CardInsightResult });
    } catch (err: unknown) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Request failed." });
    }
  }, [getFrontImageBase64, grade]);

  if (state.status === "idle") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Optional: identify this card and get a rough market value estimate using Claude. This sends your
          front photo to Claude&apos;s API for this one action — unlike the grading above, which never
          leaves your browser.
        </p>
        <button
          type="button"
          onClick={runEstimate}
          className="self-start rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
        >
          Estimate market value
        </button>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Identifying the card and estimating value…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
        <p>{state.message}</p>
        <button
          type="button"
          onClick={runEstimate}
          className="self-start rounded-full border border-rose-300 px-4 py-1.5 text-xs font-medium hover:border-rose-400 dark:border-rose-800"
        >
          Try again
        </button>
      </div>
    );
  }

  const { identification, signatureNote, surfaceAssessment, valueEstimate, caveats } = state.result;
  const hasValue = valueEstimate.low !== null && valueEstimate.high !== null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {identification.subject ?? "Unidentified card"}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {[identification.year, identification.setName, identification.cardNumber && `#${identification.cardNumber}`, identification.variant]
            .filter(Boolean)
            .join(" · ") || "Details not confidently identified"}
          {" · "}
          {identification.confidence} confidence
        </p>
      </div>

      {signatureNote && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {signatureNote} Authenticity cannot be determined from a photo.
        </p>
      )}

      <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Surface, by AI{surfaceAssessment.score !== null ? `: ${surfaceAssessment.score.toFixed(1)} / 10` : ""}
          </span>
          {surfaceAssessment.score !== null && (
            <button
              type="button"
              onClick={() => onApplySurfaceAssessment(surfaceAssessment.score as number, surfaceAssessment.reasoning)}
              className="rounded-full border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:border-blue-400 dark:border-blue-800 dark:text-blue-400"
            >
              Use this for Surface
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{surfaceAssessment.reasoning}</p>
      </div>

      <div>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {hasValue ? `$${valueEstimate.low} – $${valueEstimate.high}` : "Not enough information to estimate"}
        </p>
        {valueEstimate.basis && <p className="text-xs text-zinc-500 dark:text-zinc-400">{valueEstimate.basis}</p>}
      </div>

      {caveats.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-500 dark:text-zinc-400">
          {caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
