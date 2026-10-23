import type { GradeResult } from "@/lib/types";

interface GradeSummaryProps {
  grade: GradeResult;
}

export function GradeSummary({ grade }: GradeSummaryProps) {
  const rangeLabel = grade.low === grade.high ? `${grade.low}` : `${grade.low}–${grade.high}`;

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-zinc-900 px-8 py-10 text-center text-white dark:bg-zinc-100 dark:text-zinc-900">
      <span className="text-sm uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Estimated grade</span>
      <span className="text-6xl font-bold">{rangeLabel}</span>
      <span className="text-sm text-zinc-400 dark:text-zinc-500">out of 10 — PSA-style scale</span>
      {grade.cappedBy && (
        <span className="mt-2 max-w-sm text-xs text-zinc-400 dark:text-zinc-500">
          Capped by {grade.cappedBy} — one weak factor limits the overall estimate, the way real grading works.
        </span>
      )}
    </div>
  );
}
