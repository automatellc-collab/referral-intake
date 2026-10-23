"use client";

import { CHECKLIST_OPTIONS } from "@/lib/checklist";
import type { GradeFactorId } from "@/lib/types";

interface ManualOverridePanelProps {
  factor: Exclude<GradeFactorId, "centering">;
  label: string;
  selectedOptionId?: string;
  /** Whether a confirmation (checklist or otherwise, e.g. an AI assessment) is currently active for this factor. */
  hasActiveOverride?: boolean;
  onSelect: (optionId: string | null) => void;
}

export function ManualOverridePanel({
  factor,
  label,
  selectedOptionId,
  hasActiveOverride,
  onSelect,
}: ManualOverridePanelProps) {
  const options = CHECKLIST_OPTIONS[factor];
  const showClear = hasActiveOverride ?? Boolean(selectedOptionId);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Rate {label} yourself (optional — overrides the automated estimate)
        </span>
        {showClear && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedOptionId === option.id
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
