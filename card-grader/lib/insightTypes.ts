export interface CardInsightGradeInput {
  overall: number;
  low: number;
  high: number;
  centering: number;
  corners: number;
  edges: number;
  /**
   * The local pixel-texture heuristic's surface guess. Passed through for
   * context only — it's known to be unreliable (can't tell printed detail
   * from real damage) and should not be treated as ground truth.
   */
  surfaceHeuristic: number;
}

export interface CardInsightRequest {
  frontImageBase64: string;
  backImageBase64?: string;
  grade: CardInsightGradeInput;
}

export type IdentificationConfidence = "low" | "medium" | "high";

export interface CardIdentification {
  subject: string | null;
  setName: string | null;
  year: string | null;
  cardNumber: string | null;
  variant: string | null;
  confidence: IdentificationConfidence;
}

export interface CardValueEstimate {
  low: number | null;
  high: number | null;
  currency: "USD";
  basis: string;
}

export interface CardSurfaceAssessment {
  /** 1-10, same scale as the rest of the app. Null if the photo doesn't allow a real assessment. */
  score: number | null;
  reasoning: string;
}

export interface CardInsightResult {
  identification: CardIdentification;
  signatureNote: string | null;
  surfaceAssessment: CardSurfaceAssessment;
  valueEstimate: CardValueEstimate;
  caveats: string[];
}

export interface CardInsightErrorResponse {
  error: string;
}
