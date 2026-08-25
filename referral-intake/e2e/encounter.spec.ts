import { test, expect } from "@playwright/test";

test.describe("Ambient Scribe (encounter recording)", () => {
  test("is reachable from the Referral Intake homepage", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act
    await page.getByRole("link", { name: "Try live encounter recording" }).click();

    // Assert
    await expect(page).toHaveURL(/\/encounter$/);
    await expect(page.getByRole("heading", { name: "Ambient Scribe" })).toBeVisible();
  });

  test("shows the recording-specific consent disclaimer", async ({ page }) => {
    // Arrange / Act
    await page.goto("/encounter");

    // Assert
    await expect(page.getByText(/requires the patient/i)).toBeVisible();
    await expect(page.getByText(/every party.{0,2}s consent/i)).toBeVisible();
  });

  test("links back to Referral Intake", async ({ page }) => {
    // Arrange
    await page.goto("/encounter");

    // Act
    await page.getByRole("link", { name: "Back to Referral Intake" }).click();

    // Assert
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Referral Intake" })).toBeVisible();
  });

  test("the encounter note panel starts in its empty state", async ({ page }) => {
    // Arrange / Act
    await page.goto("/encounter");

    // Assert
    await expect(page.getByText(/Record the encounter, then generate a note/)).toBeVisible();
  });

  test("shows an unsupported-browser message when speech recognition is unavailable", async ({ page }) => {
    // Arrange — simulate a browser without the Web Speech API before any page script runs
    await page.addInitScript(() => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    });

    // Act
    await page.goto("/encounter");

    // Assert
    await expect(page.getByText(/needs a browser with speech recognition support/i)).toBeVisible();
  });
});
