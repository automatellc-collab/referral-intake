import type { GradeFactorId, GradeResult, Subscores } from "./types";

const WEIGHTS: Record<GradeFactorId, number> = {
  centering: 0.4,
  corners: 0.2,
  edges: 0.2,
  surface: 0.2,
};

const GRADE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nearestStepDown(value: number): number {
  return GRADE_STEPS.filter((step) => step <= value).pop() ?? GRADE_STEPS[0];
}

function nearestStepUp(value: number): number {
  return GRADE_STEPS.find((step) => step >= value) ?? GRADE_STEPS[GRADE_STEPS.length - 1];
}

/**
 * Combines the factor subscores into an overall estimated grade using a
 * weighted average (centering weighted highest, as the only objectively-
 * measured factor) capped by the weakest factor so a single bad factor
 * can't be averaged away by good ones.
 *
 * Surface is excluded from both the average and the cap unless it's been
 * confirmed by a trusted source — the user's own checklist rating, or the
 * AI vision assessment — rather than left as the raw heuristic guess: the
 * local pixel-texture heuristic can't reliably tell printed card art/text
 * from physical damage, so an unconfirmed reading shouldn't be allowed to
 * silently drag down (or inflate) the grade.
 */
export function computeOverallGrade(subscores: Subscores): GradeResult {
  const surfaceConfirmed = subscores.surface.source !== "heuristic";
  const activeFactors: GradeFactorId[] = surfaceConfirmed
    ? ["centering", "corners", "edges", "surface"]
    : ["centering", "corners", "edges"];

  const weightSum = activeFactors.reduce((sum, factor) => sum + WEIGHTS[factor], 0);
  const weighted = activeFactors.reduce(
    (sum, factor) => sum + subscores[factor].value * (WEIGHTS[factor] / weightSum),
    0,
  );

  let worstFactor = activeFactors[0];
  let worstValue = subscores[worstFactor].value;
  for (const factor of activeFactors) {
    if (subscores[factor].value < worstValue) {
      worstValue = subscores[factor].value;
      worstFactor = factor;
    }
  }

  const cap = worstValue + 0.5;
  const overall = clamp(Math.min(weighted, cap), 1, 10);
  const cappedBy = overall === cap && cap < weighted ? worstFactor : null;

  const low = nearestStepDown(clamp(overall - 0.5, 1, 10));
  const high = nearestStepUp(clamp(overall + 0.5, 1, 10));

  return { overall, low, high, cappedBy, surfaceExcluded: !surfaceConfirmed };
}
