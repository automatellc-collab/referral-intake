import { describe, expect, test } from "vitest";
import { SPECIALTIES, OTHER_SPECIALTY } from "./specialties";

describe("SPECIALTIES", () => {
  test("contains no duplicate entries", () => {
    // Arrange
    const unique = new Set(SPECIALTIES);

    // Act / Assert
    expect(unique.size).toBe(SPECIALTIES.length);
  });

  test("contains a reasonable number of common specialties", () => {
    // Arrange / Act / Assert
    expect(SPECIALTIES.length).toBeGreaterThanOrEqual(30);
  });

  test("does not include the Other sentinel as a real specialty", () => {
    // Arrange / Act / Assert
    expect(SPECIALTIES).not.toContain(OTHER_SPECIALTY);
  });

  test("every entry is non-empty text", () => {
    // Arrange / Act
    const hasBlankEntry = SPECIALTIES.some((s) => s.trim().length === 0);

    // Assert
    expect(hasBlankEntry).toBe(false);
  });
});
