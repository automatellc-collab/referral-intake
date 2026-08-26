import { describe, expect, test, vi, beforeEach } from "vitest";

const delMock = vi.fn();

vi.mock("@vercel/blob", () => ({
  del: delMock,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/attachments/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OWNED_URL = "https://7p93e8lptahblpnx.private.blob.vercel-storage.com/attachments/a.pdf";

beforeEach(() => {
  delMock.mockReset();
  delMock.mockResolvedValue(undefined);
});

describe("POST /api/attachments/delete", () => {
  test("returns 400 when the request body is not valid JSON", async () => {
    // Arrange
    const request = new Request("http://localhost/api/attachments/delete", { method: "POST", body: "not json" });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
  });

  test("returns 400 when url is missing", async () => {
    // Arrange
    const request = makeRequest({});

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid attachment url/i);
    expect(delMock).not.toHaveBeenCalled();
  });

  test("returns 400 when the url does not belong to our blob store", async () => {
    // Arrange
    const request = makeRequest({ url: "https://evil.example.com/a.pdf" });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
    expect(delMock).not.toHaveBeenCalled();
  });

  test("deletes the blob and returns ok for a valid owned url", async () => {
    // Arrange
    const request = makeRequest({ url: OWNED_URL });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(delMock).toHaveBeenCalledWith(OWNED_URL);
  });

  test("still returns ok when the underlying delete fails", async () => {
    // Arrange
    delMock.mockRejectedValue(new Error("not found"));
    const request = makeRequest({ url: OWNED_URL });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
