import { describe, expect, test } from "vitest";
import { FieldStatus, NoteSummarySchema, UrgencyLevel } from "./schema";

function validSummary() {
  return {
    openingNarrative: { status: "extracted", value: "Draft HPI paragraph." },
    urgency: { level: "Routine", rationale: "No urgency language present." },
    resultsTimeline: [{ date: "1/1/2026", test: "CBC", finding: "WNL" }],
    reviewOfSystemsNotes: ["Denies chest pain."],
    medicalHistory: ["Hypertension"],
    activeProblems: [{ diagnosis: "Hypertension", icdCode: "" }],
    surgicalHistory: [],
    currentMedications: { status: "missing", items: [] },
    allergies: { status: "extracted", items: ["NKDA"] },
    socialHistoryNotes: [],
    redFlags: [],
    gaps: [],
  };
}

describe("NoteSummarySchema", () => {
  test("accepts a fully-populated valid summary", () => {
    // Arrange
    const candidate = validSummary();

    // Act
    const result = NoteSummarySchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(true);
  });

  test("accepts empty arrays and empty strings for genuinely absent data", () => {
    // Arrange
    const candidate = {
      ...validSummary(),
      resultsTimeline: [],
      medicalHistory: [],
      activeProblems: [],
      redFlags: [],
      gaps: [],
    };

    // Act
    const result = NoteSummarySchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(true);
  });

  test("rejects a summary missing a required top-level field", () => {
    // Arrange
    const candidate = validSummary() as Partial<ReturnType<typeof validSummary>>;
    delete candidate.urgency;

    // Act
    const result = NoteSummarySchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(false);
  });

  test("rejects an urgency level outside the enum", () => {
    // Arrange
    const candidate = { ...validSummary(), urgency: { level: "Emergency", rationale: "x" } };

    // Act
    const result = NoteSummarySchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(false);
  });

  test("rejects an active problem missing icdCode", () => {
    // Arrange
    const candidate = { ...validSummary(), activeProblems: [{ diagnosis: "Pelvic mass" }] };

    // Act
    const result = NoteSummarySchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe("FieldStatus", () => {
  test.each(["extracted", "inferred", "missing"])("accepts %s", (status) => {
    // Arrange / Act
    const result = FieldStatus.safeParse(status);

    // Assert
    expect(result.success).toBe(true);
  });

  test("rejects an unrecognized status", () => {
    // Arrange / Act
    const result = FieldStatus.safeParse("confirmed");

    // Assert
    expect(result.success).toBe(false);
  });
});

describe("UrgencyLevel", () => {
  test.each(["Routine", "Urgent", "STAT"])("accepts %s", (level) => {
    // Arrange / Act
    const result = UrgencyLevel.safeParse(level);

    // Assert
    expect(result.success).toBe(true);
  });
});
