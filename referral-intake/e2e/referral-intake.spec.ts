import { test, expect, type Route } from "@playwright/test";

const MOCK_SUMMARY = {
  openingNarrative: {
    status: "extracted",
    value: "64-year-old referred for evaluation of a pelvic mass identified on CT scan.",
  },
  urgency: { level: "Urgent", rationale: "Large complex mass warrants expedited evaluation." },
  resultsTimeline: [{ date: "7/21/2026", test: "CT Abdomen/Pelvis", finding: "Complex pelvic cyst." }],
  reviewOfSystemsNotes: ["Denies postmenopausal bleeding."],
  medicalHistory: ["Hypertension"],
  activeProblems: [{ diagnosis: "Pelvic mass", icdCode: "R19.00" }],
  surgicalHistory: ["Two prior C-sections."],
  currentMedications: { status: "missing", items: [] },
  allergies: { status: "extracted", items: ["NKDA"] },
  socialHistoryNotes: ["Current smoker."],
  redFlags: [{ term: "Large complex mass", context: "30x19x11 cm complex pelvic cyst." }],
  gaps: ["No current medication list included."],
};

async function mockExtractSuccess(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ summary: MOCK_SUMMARY, specialty: "Gynecologic Oncology" }),
  });
}

/**
 * Attachments upload directly to Vercel Blob storage, bypassing our own server. Our
 * own token route runs for real — it's a cheap, local signing operation against a real
 * (test) store and produces a token the SDK will actually accept — but the data-carrying
 * PUT (which the client SDK sends to https://vercel.com/api/blob/) is mocked so no bytes
 * ever leave the test, and the fake response echoes back whatever pathname the client
 * actually requested, so multiple attachments in one test each get their own distinct URL.
 */
async function mockBlobUpload(page: import("@playwright/test").Page) {
  await page.route("**vercel.com/api/blob/**", async (route) => {
    const pathname = new URL(route.request().url()).searchParams.get("pathname") ?? "attachments/unknown";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: `https://fake-store.private.blob.vercel-storage.com/${pathname}`,
        downloadUrl: `https://fake-store.private.blob.vercel-storage.com/${pathname}?download=1`,
        pathname,
        contentType: "application/pdf",
        contentDisposition: "attachment",
      }),
    });
  });
  await page.route("**/api/attachments/delete", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

test.describe("Referral Intake", () => {
  test("extract button is disabled until a specialty and referral content are provided", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act / Assert
    await expect(page.getByRole("button", { name: "Extract pre-chart summary" })).toBeDisabled();

    await page.getByLabel("Specialty").selectOption("Cardiology");
    await expect(page.getByRole("button", { name: "Extract pre-chart summary" })).toBeDisabled();

    await page.getByPlaceholder(/Paste a referral letter/).fill("Reason for referral: chest pain.");
    await expect(page.getByRole("button", { name: "Extract pre-chart summary" })).toBeEnabled();
  });

  test("loading a sample populates specialty and referral text", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act
    await page.getByRole("button", { name: "Load gynecologic oncology sample" }).click();

    // Assert
    await expect(page.getByLabel("Specialty")).toHaveValue("Gynecologic Oncology");
    await expect(page.getByPlaceholder(/Paste a referral letter/)).toContainText("Dr. Bradley Goldberg");
    await expect(page.getByRole("button", { name: "Extract pre-chart summary" })).toBeEnabled();
  });

  test("extracting a referral renders the pre-chart summary", async ({ page }) => {
    // Arrange
    await page.route("**/api/extract", mockExtractSuccess);
    await page.goto("/");
    await page.getByRole("button", { name: "Load gynecologic oncology sample" }).click();

    // Act
    await page.getByRole("button", { name: "Extract pre-chart summary" }).click();

    // Assert
    const summaryPanel = page.locator("section.panel", {
      has: page.getByRole("heading", { name: "Pre-chart summary" }),
    });
    await expect(summaryPanel.locator(".summary-meta")).toContainText("Urgent");
    await expect(summaryPanel.locator(".summary-meta")).toContainText("Gynecologic Oncology");
    await expect(summaryPanel.getByText(/pelvic mass identified on CT scan/)).toBeVisible();
    await expect(summaryPanel.getByText("R19.00")).toBeVisible();
    await expect(summaryPanel.getByText("Flagged for review", { exact: false })).toBeVisible();
    await expect(summaryPanel.getByText("Large complex mass", { exact: false })).toBeVisible();
    await expect(summaryPanel.getByText("No current medication list included.")).toBeVisible();
  });

  test("extraction failure surfaces the server's error message", async ({ page }) => {
    // Arrange
    await page.route("**/api/extract", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "specialty is required." }),
      });
    });
    await page.goto("/");
    await page.getByLabel("Specialty").selectOption("Cardiology");
    await page.getByPlaceholder(/Paste a referral letter/).fill("Reason for referral: chest pain.");

    // Act
    await page.getByRole("button", { name: "Extract pre-chart summary" }).click();

    // Assert
    await expect(page.getByText("specialty is required.")).toBeVisible();
  });

  test("selecting Other reveals a free-text specialty field", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act
    await page.getByLabel("Specialty").selectOption("Other");
    const otherInput = page.getByPlaceholder("Type the specialty…");
    await otherInput.fill("Interventional Radiology");

    // Assert
    await expect(otherInput).toHaveValue("Interventional Radiology");
  });

  test("an attached file can be removed before extracting", async ({ page }) => {
    // Arrange
    await mockBlobUpload(page);
    await page.goto("/");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    });
    await expect(page.getByText("report.pdf")).toBeVisible();

    // Act
    await page.getByRole("button", { name: "Remove report.pdf" }).click();

    // Assert
    await expect(page.getByText("report.pdf")).toHaveCount(0);
  });

  test("extracting with multiple attachments sends blob URL references, not file bytes", async ({ page }) => {
    // Arrange — recreates the real production scenario: two attached PDFs, one specialty selected.
    await mockBlobUpload(page);
    let extractRequestBody: { attachments?: Array<{ url?: string; base64?: string }> } | undefined;
    await page.route("**/api/extract", async (route) => {
      extractRequestBody = route.request().postDataJSON();
      await mockExtractSuccess(route);
    });
    await page.goto("/");
    await page.getByLabel("Specialty").selectOption("Gynecologic Oncology");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      { name: "Mcpipkin.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 first") },
      { name: "Mcpipkin2.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 second") },
    ]);
    await expect(page.getByText("Mcpipkin.pdf")).toBeVisible();
    await expect(page.getByText("Mcpipkin2.pdf")).toBeVisible();

    // Act
    await page.getByRole("button", { name: "Extract pre-chart summary" }).click();

    // Assert
    const summaryPanel = page.locator("section.panel", {
      has: page.getByRole("heading", { name: "Pre-chart summary" }),
    });
    await expect(summaryPanel.getByText(/pelvic mass identified on CT scan/)).toBeVisible();
    expect(extractRequestBody?.attachments).toHaveLength(2);
    for (const attachment of extractRequestBody?.attachments ?? []) {
      expect(attachment.url).toMatch(/^https:\/\/.*\.vercel-storage\.com\//);
      expect(attachment.base64).toBeUndefined();
    }
  });

  test("Clear resets the form back to its empty state", async ({ page }) => {
    // Arrange
    await page.goto("/");
    await page.getByRole("button", { name: "Load dermatology sample" }).click();
    await expect(page.getByLabel("Specialty")).toHaveValue("Dermatology");

    // Act
    await page.getByRole("button", { name: "Clear" }).click();

    // Assert
    await expect(page.getByPlaceholder(/Paste a referral letter/)).toHaveValue("");
    await expect(page.getByRole("button", { name: "Extract pre-chart summary" })).toBeDisabled();
  });
});
