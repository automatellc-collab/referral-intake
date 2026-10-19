import { describe, expect, test } from "vitest";
import { parseJsonResponse } from "./parseJsonResponse";

describe("parseJsonResponse", () => {
  test("parses a valid JSON body", async () => {
    // Arrange
    const response = new Response(JSON.stringify({ summary: "ok" }), { status: 200 });

    // Act
    const body = await parseJsonResponse<{ summary: string }>(response);

    // Assert
    expect(body).toEqual({ summary: "ok" });
  });

  test("returns an empty object for an empty body", async () => {
    // Arrange
    const response = new Response("", { status: 200 });

    // Act
    const body = await parseJsonResponse(response);

    // Assert
    expect(body).toEqual({});
  });

  test("throws a specific, actionable message for a non-JSON 413 response", async () => {
    // Arrange — mirrors Vercel's plain-text "Request Entity Too Large" body on payload-too-large
    const response = new Response("Request Entity Too Large", { status: 413 });

    // Act
    const act = parseJsonResponse(response);

    // Assert
    await expect(act).rejects.toThrow(/too large/i);
  });

  test("throws a generic message with the status code for any other non-JSON body", async () => {
    // Arrange
    const response = new Response("<html>Internal Server Error</html>", { status: 500 });

    // Act
    const act = parseJsonResponse(response);

    // Assert
    await expect(act).rejects.toThrow(/unexpected response \(HTTP 500\)/i);
  });
});
