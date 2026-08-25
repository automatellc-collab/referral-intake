import { describe, expect, test, vi, beforeEach } from "vitest";

const generateEncounterNoteMock = vi.fn();

vi.mock("@/lib/generateEncounterNote", () => ({
  generateEncounterNote: generateEncounterNoteMock,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/encounter-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  generateEncounterNoteMock.mockReset();
});

describe("POST /api/encounter-notes", () => {
  test("returns 400 when the request body is not valid JSON", async () => {
    // Arrange
    const request = new Request("http://localhost/api/encounter-notes", { method: "POST", body: "not json" });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
  });

  test("returns 400 when transcript is missing", async () => {
    // Arrange
    const request = makeRequest({});

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/transcript is required/i);
  });

  test("returns 400 when transcript is too short to summarize", async () => {
    // Arrange
    const request = makeRequest({ transcript: "hi" });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
  });

  test("returns 400 when transcript exceeds the character limit", async () => {
    // Arrange
    const request = makeRequest({ transcript: "x".repeat(50_001) });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/character limit/i);
  });

  test("returns 200 with the generated note on success", async () => {
    // Arrange
    const fakeNote = { summary: "Routine follow-up visit." };
    generateEncounterNoteMock.mockResolvedValue(fakeNote);
    const request = makeRequest({ transcript: "Doctor and patient discuss blood pressure control today." });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(body.note).toEqual(fakeNote);
    expect(generateEncounterNoteMock).toHaveBeenCalledWith("Doctor and patient discuss blood pressure control today.");
  });

  test("returns 500 with a generic message for an unexpected error", async () => {
    // Arrange
    generateEncounterNoteMock.mockRejectedValue(new Error("unexpected"));
    const request = makeRequest({ transcript: "Doctor and patient discuss blood pressure control today." });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toMatch(/something went wrong/i);
  });

  test("returns 502 when the note service raises an Anthropic API error", async () => {
    // Arrange
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    generateEncounterNoteMock.mockRejectedValue(new Anthropic.APIError(500, {}, "boom", new Headers()));
    const request = makeRequest({ transcript: "Doctor and patient discuss blood pressure control today." });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(502);
  });

  test("returns 429 when the note service is rate limited", async () => {
    // Arrange
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    generateEncounterNoteMock.mockRejectedValue(new Anthropic.RateLimitError(429, {}, "slow down", new Headers()));
    const request = makeRequest({ transcript: "Doctor and patient discuss blood pressure control today." });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(429);
    expect(body.error).toMatch(/rate limited/i);
  });

  test("returns 500 with an admin-facing message when the API key is invalid", async () => {
    // Arrange
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    generateEncounterNoteMock.mockRejectedValue(new Anthropic.AuthenticationError(401, {}, "invalid key", new Headers()));
    const request = makeRequest({ transcript: "Doctor and patient discuss blood pressure control today." });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toMatch(/site administrator/i);
  });
});
