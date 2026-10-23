import type { BorderLines, CenteringAxisResult, CenteringResult } from "./types";

/**
 * Commonly-cited community reference for PSA centering tolerances, keyed by
 * how far off 50/50 the worse side sits (e.g. a 70/30 split is 40 points off).
 * This is NOT an official published PSA formula — PSA weighs centering
 * alongside corners/edges/surface rather than grading it in isolation.
 */
const OFF_CENTER_TO_SUBSCORE: Array<{ offCenterPct: number; subscore: number }> = [
  { offCenterPct: 0, subscore: 10 },
  { offCenterPct: 10, subscore: 10 },
  { offCenterPct: 20, subscore: 9 },
  { offCenterPct: 40, subscore: 8 },
  { offCenterPct: 50, subscore: 7 },
  { offCenterPct: 60, subscore: 6 },
  { offCenterPct: 70, subscore: 5 },
  { offCenterPct: 80, subscore: 4 },
  { offCenterPct: 90, subscore: 2.5 },
  { offCenterPct: 100, subscore: 1 },
];

function interpolateSubscore(offCenterPct: number): number {
  const clamped = Math.min(100, Math.max(0, offCenterPct));
  for (let i = 0; i < OFF_CENTER_TO_SUBSCORE.length - 1; i++) {
    const current = OFF_CENTER_TO_SUBSCORE[i];
    const next = OFF_CENTER_TO_SUBSCORE[i + 1];
    if (clamped >= current.offCenterPct && clamped <= next.offCenterPct) {
      const span = next.offCenterPct - current.offCenterPct;
      const progress = span === 0 ? 0 : (clamped - current.offCenterPct) / span;
      return current.subscore + (next.subscore - current.subscore) * progress;
    }
  }
  return 1;
}

function axisResult(nearMargin: number, farMargin: number): CenteringAxisResult {
  const total = nearMargin + farMargin;
  const nearSidePct = total === 0 ? 50 : (Math.max(nearMargin, farMargin) / total) * 100;
  const farSidePct = 100 - nearSidePct;
  const offCenterPct = Math.abs(nearSidePct - 50) * 2;
  return { nearSidePct, farSidePct, offCenterPct };
}

/**
 * Computes the centering ratio and subscore from the four border-guideline
 * handle positions a user calibrated against the card's inner border.
 */
export function computeCentering(lines: BorderLines): CenteringResult {
  const leftMargin = lines.left;
  const rightMargin = lines.cardWidth - lines.right;
  const topMargin = lines.top;
  const bottomMargin = lines.cardHeight - lines.bottom;

  const horizontal = axisResult(leftMargin, rightMargin);
  const vertical = axisResult(topMargin, bottomMargin);

  const worstOffCenter = Math.max(horizontal.offCenterPct, vertical.offCenterPct);
  const subscore = interpolateSubscore(worstOffCenter);

  return { horizontal, vertical, subscore };
}

export function formatRatio(nearSidePct: number, farSidePct: number): string {
  return `${Math.round(nearSidePct)}/${Math.round(farSidePct)}`;
}
