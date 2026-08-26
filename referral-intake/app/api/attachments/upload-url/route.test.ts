import { describe, expect, test, vi, beforeEach } from "vitest";

const handleUploadMock = vi.fn();

vi.mock("@vercel/blob/client", () => ({
  handleUpload: handleUploadMock,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/attachments/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  handleUploadMock.mockReset();
});

describe("POST /api/attachments/upload-url", () => {
  test("returns 400 when the request body is not valid JSON", async () => {
    // Arrange
    const request = new Request("http://localhost/api/attachments/upload-url", { method: "POST", body: "not json" });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/JSON/i);
  });

  test("returns the client token payload from handleUpload on success", async () => {
    // Arrange
    handleUploadMock.mockResolvedValue({ type: "blob.generate-client-token", clientToken: "fake-token" });
    const request = makeRequest({
      type: "blob.generate-client-token",
      payload: { pathname: "attachments/a.pdf", multipart: false, clientPayload: null },
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(body).toEqual({ type: "blob.generate-client-token", clientToken: "fake-token" });
  });

  test("constrains generated tokens to allowed content types and the size budget", async () => {
    // Arrange
    handleUploadMock.mockResolvedValue({ type: "blob.generate-client-token", clientToken: "fake-token" });
    const request = makeRequest({
      type: "blob.generate-client-token",
      payload: { pathname: "attachments/a.pdf", multipart: false, clientPayload: null },
    });

    // Act
    await POST(request);

    // Assert
    const options = handleUploadMock.mock.calls[0][0];
    const tokenOptions = await options.onBeforeGenerateToken("attachments/a.pdf", null, false);
    expect(tokenOptions.allowedContentTypes).toEqual(
      expect.arrayContaining(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]),
    );
    expect(tokenOptions.maximumSizeInBytes).toBeGreaterThan(0);
  });

  test("returns 400 with the error message when handleUpload rejects", async () => {
    // Arrange
    handleUploadMock.mockRejectedValue(new Error("invalid signature"));
    const request = makeRequest({ type: "blob.upload-completed", payload: {} });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid signature");
  });
});
