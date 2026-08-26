import { describe, expect, test, vi, beforeEach } from "vitest";

const extractSummaryMock = vi.fn();
const headMock = vi.fn();
const getMock = vi.fn();
const delMock = vi.fn();

vi.mock("@/lib/extract", () => ({
  extractSummary: extractSummaryMock,
}));

vi.mock("@vercel/blob", () => ({
  head: headMock,
  get: getMock,
  del: delMock,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OWNED_HOST = "https://7p93e8lptahblpnx.private.blob.vercel-storage.com";
const validAttachment = {
  filename: "report.pdf",
  mediaType: "application/pdf",
  url: `${OWNED_HOST}/attachments/report.pdf`,
};

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body as ReadableStream<Uint8Array>;
}

beforeEach(() => {
  extractSummaryMock.mockReset();
  headMock.mockReset();
  getMock.mockReset();
  delMock.mockReset();
  delMock.mockResolvedValue(undefined);
  headMock.mockResolvedValue({ size: 11 });
  getMock.mockResolvedValue({ statusCode: 200, stream: streamOf("hello world"), blob: { size: 11 } });
});

describe("POST /api/extract", () => {
  test("returns 400 when the request body is not valid JSON", async () => {
    // Arrange
    const request = new Request("http://localhost/api/extract", { method: "POST", body: "not json" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/JSON/i);
  });

  test("returns 400 when referralText is not a string", async () => {
    // Arrange
    const request = makeRequest({ referralText: 123, specialty: "Cardiology" });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
  });

  test("returns 400 when referralText exceeds the character limit", async () => {
    // Arrange
    const request = makeRequest({ referralText: "x".repeat(20_001), specialty: "Cardiology" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/character limit/i);
  });

  test("returns 400 when specialty is missing", async () => {
    // Arrange
    const request = makeRequest({ referralText: "Reason for referral: chest pain." });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/specialty/i);
  });

  test("returns 400 when specialty exceeds the character limit", async () => {
    // Arrange
    const request = makeRequest({ referralText: "text", specialty: "x".repeat(101) });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/character limit/i);
  });

  test("returns 400 when specialty is only whitespace", async () => {
    // Arrange
    const request = makeRequest({ referralText: "text", specialty: "   " });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
  });

  test("returns 400 when neither referralText nor attachments are provided", async () => {
    // Arrange
    const request = makeRequest({ referralText: "", specialty: "Cardiology" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/attachment/i);
  });

  test("returns 400 when an attachment has an unsupported media type", async () => {
    // Arrange
    const request = makeRequest({
      referralText: "text",
      specialty: "Cardiology",
      attachments: [{ filename: "notes.docx", mediaType: "application/msword", url: `${OWNED_HOST}/notes.docx` }],
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/unsupported file type/i);
  });

  test("returns 400 when an attachment is missing a filename", async () => {
    // Arrange
    const request = makeRequest({
      referralText: "text",
      specialty: "Cardiology",
      attachments: [{ mediaType: "application/pdf", url: `${OWNED_HOST}/a.pdf` }],
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/needs a filename/i);
  });

  test("returns 400 when an attachment's url does not belong to our blob store", async () => {
    // Arrange
    const request = makeRequest({
      referralText: "text",
      specialty: "Cardiology",
      attachments: [{ filename: "scan.png", mediaType: "image/png", url: "https://evil.example.com/scan.png" }],
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid or expired upload reference/i);
  });

  test("returns 400 and cleans up when a single attachment exceeds the combined size budget", async () => {
    // Arrange — 20MB combined budget
    headMock.mockResolvedValue({ size: 21 * 1024 * 1024 });
    const request = makeRequest({ referralText: "text", specialty: "Cardiology", attachments: [validAttachment] });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/combined/i);
    expect(delMock).toHaveBeenCalledWith([validAttachment.url]);
  });

  test("returns 400 when multiple attachments individually fit but combined exceed the budget", async () => {
    // Arrange — two files, each under any per-file cap, but summing past the 20MB combined budget
    headMock.mockResolvedValue({ size: 11 * 1024 * 1024 });
    const request = makeRequest({
      referralText: "text",
      specialty: "Gynecologic Oncology",
      attachments: [
        { filename: "Mcpipkin.pdf", mediaType: "application/pdf", url: `${OWNED_HOST}/Mcpipkin.pdf` },
        { filename: "Mcpipkin2.pdf", mediaType: "application/pdf", url: `${OWNED_HOST}/Mcpipkin2.pdf` },
      ],
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/combined/i);
  });

  test("returns 400 when the attachment count exceeds the maximum", async () => {
    // Arrange
    const request = makeRequest({
      referralText: "text",
      specialty: "Cardiology",
      attachments: Array.from({ length: 6 }, (_, i) => ({ ...validAttachment, filename: `f${i}.pdf` })),
    });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
  });

  test("returns 400 when an attachment cannot be found in blob storage", async () => {
    // Arrange
    headMock.mockRejectedValue(new Error("not found"));
    const request = makeRequest({ referralText: "text", specialty: "Cardiology", attachments: [validAttachment] });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/could not be found/i);
  });

  test("accepts a request with only attachments and no cover text, fetching and base64-encoding them", async () => {
    // Arrange
    extractSummaryMock.mockResolvedValue({ ok: true });
    const request = makeRequest({ referralText: "", specialty: "Radiology", attachments: [validAttachment] });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(extractSummaryMock).toHaveBeenCalledWith("Radiology", "", [
      { filename: "report.pdf", mediaType: "application/pdf", base64: Buffer.from("hello world").toString("base64") },
    ]);
  });

  test("deletes the attachment blobs after a successful extraction", async () => {
    // Arrange
    extractSummaryMock.mockResolvedValue({ ok: true });
    const request = makeRequest({ referralText: "text", specialty: "Radiology", attachments: [validAttachment] });

    // Act
    await POST(request);

    // Assert
    expect(delMock).toHaveBeenCalledWith([validAttachment.url]);
  });

  test("keeps the attachment blobs in place when extraction itself fails, so a retry doesn't need re-upload", async () => {
    // Arrange
    extractSummaryMock.mockRejectedValue(new Error("unexpected"));
    const request = makeRequest({ referralText: "text", specialty: "Radiology", attachments: [validAttachment] });

    // Act
    await POST(request);

    // Assert
    expect(delMock).not.toHaveBeenCalled();
  });

  test("returns 200 with the summary and trimmed specialty on success", async () => {
    // Arrange
    const fakeSummary = { openingNarrative: { status: "extracted", value: "..." } };
    extractSummaryMock.mockResolvedValue(fakeSummary);
    const request = makeRequest({ referralText: "Reason for referral: chest pain.", specialty: "  Cardiology  " });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(body.summary).toEqual(fakeSummary);
    expect(body.specialty).toBe("Cardiology");
    expect(extractSummaryMock).toHaveBeenCalledWith("Cardiology", "Reason for referral: chest pain.", []);
  });

  test("returns 502 when the extraction service raises an Anthropic API error", async () => {
    // Arrange
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    extractSummaryMock.mockRejectedValue(new Anthropic.APIError(500, {}, "boom", new Headers()));
    const request = makeRequest({ referralText: "text", specialty: "Cardiology" });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(502);
  });

  test("returns 500 with an admin-facing message when the API key is invalid", async () => {
    // Arrange
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    extractSummaryMock.mockRejectedValue(new Anthropic.AuthenticationError(401, {}, "invalid key", new Headers()));
    const request = makeRequest({ referralText: "text", specialty: "Cardiology" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toMatch(/site administrator/i);
  });

  test("returns 429 when the extraction service is rate limited", async () => {
    // Arrange
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    extractSummaryMock.mockRejectedValue(new Anthropic.RateLimitError(429, {}, "slow down", new Headers()));
    const request = makeRequest({ referralText: "text", specialty: "Cardiology" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(429);
    expect(body.error).toMatch(/rate limited/i);
  });

  test("returns 502 with a connectivity message when the extraction service is unreachable", async () => {
    // Arrange
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    extractSummaryMock.mockRejectedValue(new Anthropic.APIConnectionError({ message: "network down" }));
    const request = makeRequest({ referralText: "text", specialty: "Cardiology" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(502);
    expect(body.error).toMatch(/could not reach/i);
  });

  test("returns 500 with a generic message for an unexpected error", async () => {
    // Arrange
    extractSummaryMock.mockRejectedValue(new Error("unexpected"));
    const request = makeRequest({ referralText: "text", specialty: "Cardiology" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toMatch(/something went wrong/i);
  });
});
