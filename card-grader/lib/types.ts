export type GradeFactorId = "centering" | "corners" | "edges" | "surface";

export type SubscoreSource = "heuristic" | "manual" | "ai";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Positions of the four inner-border guideline handles, in cropped-card pixel space. */
export interface BorderLines {
  top: number;
  bottom: number;
  left: number;
  right: number;
  cardWidth: number;
  cardHeight: number;
}

export interface CenteringAxisResult {
  nearSidePct: number;
  farSidePct: number;
  offCenterPct: number;
}

export interface CenteringResult {
  horizontal: CenteringAxisResult;
  vertical: CenteringAxisResult;
  subscore: number;
}

export type WearSeverity = "none" | "light" | "moderate" | "heavy";

export interface RegionFlag {
  region: string;
  severity: WearSeverity;
}

export interface HeuristicSubscoreResult {
  subscore: number;
  worstSeverity: WearSeverity;
  flags: RegionFlag[];
}

export interface Subscore {
  value: number;
  source: SubscoreSource;
  flags: RegionFlag[];
}

export type Subscores = Record<GradeFactorId, Subscore>;

export interface GradeResult {
  overall: number;
  low: number;
  high: number;
  cappedBy: GradeFactorId | null;
  surfaceExcluded: boolean;
}

export interface ChecklistOption {
  id: string;
  label: string;
  score: number;
}

/** A Surface confirmation sourced from the AI vision assessment rather than the manual checklist. */
export interface AiSurfaceOverride {
  score: number;
  note: string;
}
