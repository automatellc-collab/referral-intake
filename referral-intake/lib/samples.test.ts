import { describe, expect, test } from "vitest";
import { SPECIALTIES } from "./specialties";
import { SAMPLES } from "./samples";

describe("SAMPLES", () => {
  test("has no duplicate ids", () => {
    // Arrange
    const ids = SAMPLES.map((s) => s.id);

    // Act
    const unique = new Set(ids);

    // Assert
    expect(unique.size).toBe(ids.length);
  });

  test("every sample has non-empty text", () => {
    // Arrange / Act
    const hasEmptyText = SAMPLES.some((s) => s.text.trim().length === 0);

    // Assert
    expect(hasEmptyText).toBe(false);
  });

  test("every sample's specialty is a recognized specialty", () => {
    // Arrange / Act
    const unrecognized = SAMPLES.filter((s) => !SPECIALTIES.includes(s.specialty));

    // Assert
    expect(unrecognized).toEqual([]);
  });

  test("every sample has a non-empty, descriptive label", () => {
    // Arrange / Act
    const hasBlankLabel = SAMPLES.some((s) => s.label.trim().length === 0);

    // Assert
    expect(hasBlankLabel).toBe(false);
  });
});
