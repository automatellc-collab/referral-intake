import type { NoteSummary } from "@/lib/schema";
import type { FormattedOutput } from "@/lib/template-orchestrator";

export interface AppliedTemplate {
  id: string;
  name: string;
  specialty: string | null;
}

export interface ExtractWithTemplateResponse {
  summary: NoteSummary;
  specialty: string;
  confidence: number;
  documentType?: string;
  requiresReview?: boolean;
  reviewReason?: string;
  appliedTemplate?: AppliedTemplate;
  formattedOutput?: FormattedOutput;
  error?: string;
}

export interface TemplateOption {
  id: string;
  name: string;
  specialty: string | null;
  description?: string;
  defaultOutputFormat: "narrative" | "structured" | "checklist";
}
