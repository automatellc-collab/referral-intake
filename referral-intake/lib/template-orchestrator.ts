import type { NoteSummary } from "@/lib/schema";
import type { TemplateConfig } from "@/lib/services/template-service";

export interface FormattedOutput {
  narrative: string;
  structured: NoteSummary;
  checklist: ChecklistFormat;
}

export interface ChecklistFormat {
  sections: {
    title: string;
    items: {
      label: string;
      checked?: boolean;
      value?: string;
    }[];
  }[];
}

export class TemplateOrchestrator {
  /**
   * Apply template rules: filter, reorder, rename fields
   */
  applyTemplate(
    extraction: NoteSummary,
    config: TemplateConfig
  ): {
    filtered: NoteSummary;
    reordered: NoteSummary;
    renamed: NoteSummary;
  } {
    // Step 1: Filter fields based on visibility
    const filtered = this.filterFields(extraction, config.fieldVisibility);

    // Step 2: Reorder fields based on fieldOrder
    const reordered = this.reorderFields(filtered, config.fieldOrder);

    // Step 3: Rename fields based on fieldRenames
    const renamed = this.renameFields(reordered, config.fieldRenames);

    return { filtered, reordered, renamed };
  }

  /**
   * Format extraction output in different styles
   */
  formatOutput(
    extraction: NoteSummary,
    config: TemplateConfig,
    format: "narrative" | "structured" | "checklist"
  ): FormattedOutput {
    const { renamed } = this.applyTemplate(extraction, config);

    return {
      narrative: this.formatNarrative(renamed),
      structured: renamed,
      checklist: this.formatChecklist(renamed),
    };
  }

  private filterFields(
    extraction: NoteSummary,
    fieldVisibility: Record<string, boolean>
  ): NoteSummary {
    const filtered = { ...extraction };

    // Handle visibility for each major section
    const visibilityMap: Record<string, boolean> = {
      ...fieldVisibility,
    };

    // If a field is marked as not visible, remove or clear it
    if (visibilityMap["openingNarrative"] === false) {
      filtered.openingNarrative = {
        ...filtered.openingNarrative,
        value: "",
      };
    }

    if (visibilityMap["activeProblems"] === false) {
      filtered.activeProblems = [];
    }

    if (visibilityMap["currentMedications"] === false) {
      filtered.currentMedications = { status: "missing", items: [] };
    }

    if (visibilityMap["allergies"] === false) {
      filtered.allergies = { status: "missing", items: [] };
    }

    if (visibilityMap["redFlags"] === false) {
      filtered.redFlags = [];
    }

    if (visibilityMap["gaps"] === false) {
      filtered.gaps = [];
    }

    return filtered;
  }

  private reorderFields(
    extraction: NoteSummary,
    fieldOrder: string[]
  ): NoteSummary {
    // If fieldOrder is empty, return as-is
    if (!fieldOrder || fieldOrder.length === 0) {
      return extraction;
    }

    // Create a new object with fields in specified order
    const reordered: any = {};

    for (const fieldId of fieldOrder) {
      if (fieldId in extraction) {
        reordered[fieldId] = (extraction as any)[fieldId];
      }
    }

    // Add any remaining fields not in fieldOrder
    for (const key in extraction) {
      if (!(key in reordered)) {
        reordered[key] = (extraction as any)[key];
      }
    }

    return reordered as NoteSummary;
  }

  private renameFields(
    extraction: NoteSummary,
    fieldRenames: Record<string, string>
  ): NoteSummary {
    // For this MVP, we'll store renames in metadata
    // and return extraction as-is
    // The UI will handle display renaming
    return extraction;
  }

  private formatNarrative(extraction: NoteSummary): string {
    const sections: string[] = [];

    // Opening narrative
    if (extraction.openingNarrative?.value) {
      sections.push(`CHIEF COMPLAINT / OPENING\n${extraction.openingNarrative.value}`);
    }

    // Active problems
    if (extraction.activeProblems && extraction.activeProblems.length > 0) {
      const problems = extraction.activeProblems
        .map((p) => `• ${p.diagnosis} (${p.icdCode || "code pending"})`)
        .join("\n");
      sections.push(`ACTIVE PROBLEMS\n${problems}`);
    }

    // Current medications
    if (extraction.currentMedications?.items && extraction.currentMedications.items.length > 0) {
      const meds = extraction.currentMedications.items.join("\n• ");
      sections.push(`CURRENT MEDICATIONS\n• ${meds}`);
    }

    // Allergies
    if (extraction.allergies?.items && extraction.allergies.items.length > 0) {
      const allergies = extraction.allergies.items.join("\n• ");
      sections.push(`ALLERGIES\n• ${allergies}`);
    }

    // Red flags
    if (extraction.redFlags && extraction.redFlags.length > 0) {
      const flags = extraction.redFlags
        .map((f) => `⚠️ ${f.term}${f.context ? ` - ${f.context}` : ""}`)
        .join("\n");
      sections.push(`RED FLAGS\n${flags}`);
    }

    // Gaps
    if (extraction.gaps && extraction.gaps.length > 0) {
      const gapList = extraction.gaps.join("\n• ");
      sections.push(`INFORMATION GAPS\n• ${gapList}`);
    }

    return sections.join("\n\n---\n\n");
  }

  private formatChecklist(extraction: NoteSummary): ChecklistFormat {
    const sections = [];

    // Active problems section
    if (extraction.activeProblems && extraction.activeProblems.length > 0) {
      sections.push({
        title: "Active Problems",
        items: extraction.activeProblems.map((p) => ({
          label: `${p.diagnosis}`,
          value: p.icdCode || "code pending",
        })),
      });
    }

    // Medications section
    if (extraction.currentMedications?.items && extraction.currentMedications.items.length > 0) {
      sections.push({
        title: "Current Medications",
        items: extraction.currentMedications.items.map((m) => ({
          label: m,
          checked: true,
        })),
      });
    }

    // Allergies section
    if (extraction.allergies?.items && extraction.allergies.items.length > 0) {
      sections.push({
        title: "Allergies",
        items: extraction.allergies.items.map((a) => ({
          label: a,
          checked: true,
        })),
      });
    }

    // Red flags section
    if (extraction.redFlags && extraction.redFlags.length > 0) {
      sections.push({
        title: "⚠️ Red Flags",
        items: extraction.redFlags.map((f) => ({
          label: f.term,
          value: f.context,
          checked: true,
        })),
      });
    }

    // Gaps section
    if (extraction.gaps && extraction.gaps.length > 0) {
      sections.push({
        title: "Information Gaps",
        items: extraction.gaps.map((g) => ({
          label: g,
          checked: false,
        })),
      });
    }

    return { sections };
  }
}

export const templateOrchestrator = new TemplateOrchestrator();
