import { describe, expect, test } from "vitest";
import { EncounterNoteSchema } from "./encounterSchema";

function validNote() {
  return {
    summary: "Follow-up visit for hypertension, well controlled on current regimen.",
    vitalsMentioned: ["BP 128/82"],
    examFindings: [{ system: "Cardiovascular", finding: "Regular rate and rhythm." }],
    assessment: ["Hypertension, well controlled"],
    plan: ["Continue lisinopril 10mg daily", "Follow up in 3 months"],
    patientInstructions: ["Continue home BP monitoring"],
    followUp: "3 months",
    unclearSegments: [],
  };
}

describe("EncounterNoteSchema", () => {
  test("accepts a fully-populated valid note", () => {
    // Arrange
    const candidate = validNote();

    // Act
    const result = EncounterNoteSchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(true);
  });

  test("accepts empty arrays and an empty followUp for a sparse transcript", () => {
    // Arrange
    const candidate = {
      ...validNote(),
      vitalsMentioned: [],
      examFindings: [],
      assessment: [],
      plan: [],
      patientInstructions: [],
      followUp: "",
      unclearSegments: [],
    };

    // Act
    const result = EncounterNoteSchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(true);
  });

  test("rejects a note missing a required field", () => {
    // Arrange
    const candidate = validNote() as Partial<ReturnType<typeof validNote>>;
    delete candidate.summary;

    // Act
    const result = EncounterNoteSchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(false);
  });

  test("rejects an exam finding missing its system", () => {
    // Arrange
    const candidate = { ...validNote(), examFindings: [{ finding: "Regular rate and rhythm." }] };

    // Act
    const result = EncounterNoteSchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(false);
  });

  test("carries unclear segments through for clinician review", () => {
    // Arrange
    const candidate = { ...validNote(), unclearSegments: ["patient reports [inaudible] since last week"] };

    // Act
    const result = EncounterNoteSchema.safeParse(candidate);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data?.unclearSegments).toEqual(["patient reports [inaudible] since last week"]);
  });
});
