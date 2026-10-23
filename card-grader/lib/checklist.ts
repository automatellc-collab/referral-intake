import type { ChecklistOption, GradeFactorId } from "./types";

export const CHECKLIST_OPTIONS: Record<Exclude<GradeFactorId, "centering">, ChecklistOption[]> = {
  corners: [
    { id: "sharp", label: "Sharp, no wear", score: 10 },
    { id: "slight-fuzz", label: "Slight fuzzing under magnification", score: 8 },
    { id: "whitening", label: "Visible whitening or soft corners", score: 6 },
    { id: "rounded-chipped", label: "Rounded, chipped, or creased", score: 3 },
  ],
  edges: [
    { id: "sharp", label: "Clean, no wear", score: 10 },
    { id: "slight-fuzz", label: "Slight fuzzing", score: 8 },
    { id: "whitening", label: "Visible edge whitening", score: 6 },
    { id: "chipped", label: "Chipping or notches", score: 3 },
  ],
  surface: [
    { id: "pristine", label: "Pristine, no print or surface defects", score: 10 },
    { id: "minor", label: "Minor print lines or light scuffing", score: 8 },
    { id: "scratches", label: "Visible scratches or scuffing", score: 6 },
    { id: "major", label: "Major scratches, stains, or creasing", score: 3 },
  ],
};

export function getChecklistScore(
  factor: Exclude<GradeFactorId, "centering">,
  optionId: string,
): number {
  const option = CHECKLIST_OPTIONS[factor].find((o) => o.id === optionId);
  return option?.score ?? CHECKLIST_OPTIONS[factor][0].score;
}
