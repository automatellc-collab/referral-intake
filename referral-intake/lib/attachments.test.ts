import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const uploadMock = vi.fn();

vi.mock("@vercel/blob/client", () => ({
  upload: uploadMock,
}));

const {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  isAllowedAttachmentType,
  isOwnedBlobUrl,
  uploadAttachment,
  deleteAttachment,
} = await import("./attachments");

describe("isAllowedAttachmentType", () => {
  test.each(ALLOWED_ATTACHMENT_TYPES)("returns true for allowed type %s", (mediaType) => {
    // Arrange / Act
    const result = isAllowedAttachmentType(mediaType);

    // Assert
    expect(result).toBe(true);
  });

  test("returns false for an unsupported media type", () => {
    // Arrange
    const mediaType = "application/msword";

    // Act
    const result = isAllowedAttachmentType(mediaType);

    // Assert
    expect(result).toBe(false);
  });

  test("returns false for an empty string", () => {
    // Arrange / Act
    const result = isAllowedAttachmentType("");

    // Assert
    expect(result).toBe(false);
  });
});

describe("isOwnedBlobUrl", () => {
  test("returns true for a URL on our private blob store's domain", () => {
    // Arrange
    const url = "https://7p93e8lptahblpnx.private.blob.vercel-storage.com/attachments/abc-report.pdf";

    // Act / Assert
    expect(isOwnedBlobUrl(url)).toBe(true);
  });

  test("returns false for a URL on a different host", () => {
    // Arrange
    const url = "https://evil.example.com/attachments/abc-report.pdf";

    // Act / Assert
    expect(isOwnedBlobUrl(url)).toBe(false);
  });

  test("returns false for an unparseable URL", () => {
    // Arrange / Act / Assert
    expect(isOwnedBlobUrl("not a url")).toBe(false);
  });
});

describe("uploadAttachment", () => {
  beforeEach(() => {
    uploadMock.mockReset();
  });

  test("uploads the file to the private handleUploadUrl route and returns an Attachment", async () => {
    // Arrange
    uploadMock.mockResolvedValue({
      url: "https://7p93e8lptahblpnx.private.blob.vercel-storage.com/attachments/xyz-report.pdf",
      pathname: "attachments/xyz-report.pdf",
    });
    const file = new File(["hello world"], "report.pdf", { type: "application/pdf" });

    // Act
    const attachment = await uploadAttachment(file);

    // Assert
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^attachments\/.+-report\.pdf$/),
      file,
      expect.objectContaining({ access: "private", handleUploadUrl: "/api/attachments/upload-url" }),
    );
    expect(attachment).toEqual({
      filename: "report.pdf",
      mediaType: "application/pdf",
      url: "https://7p93e8lptahblpnx.private.blob.vercel-storage.com/attachments/xyz-report.pdf",
      pathname: "attachments/xyz-report.pdf",
      sizeBytes: file.size,
    });
  });

  test("sanitizes slashes, spaces, and other unsafe characters out of the uploaded pathname", async () => {
    // Arrange
    uploadMock.mockResolvedValue({ url: "https://x.private.blob.vercel-storage.com/a", pathname: "a" });
    const file = new File(["x"], "weird name?.pdf", { type: "application/pdf" });

    // Act
    await uploadAttachment(file);

    // Assert
    const [pathname] = uploadMock.mock.calls[0];
    expect(pathname.startsWith("attachments/")).toBe(true);
    expect(pathname.endsWith("-weird_name_.pdf")).toBe(true);
    expect(pathname).not.toMatch(/[\s?]/);
  });
});

describe("deleteAttachment", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("posts the blob URL to the delete route", async () => {
    // Arrange
    const url = "https://x.private.blob.vercel-storage.com/attachments/a.pdf";

    // Act
    await deleteAttachment(url);

    // Assert
    expect(fetch).toHaveBeenCalledWith(
      "/api/attachments/delete",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ url }) }),
    );
  });

  test("never throws when the request fails", async () => {
    // Arrange
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    // Act
    const act = deleteAttachment("https://x.private.blob.vercel-storage.com/attachments/a.pdf");

    // Assert
    await expect(act).resolves.toBeUndefined();
  });
});

describe("constants", () => {
  test("MAX_ATTACHMENTS is a positive integer", () => {
    // Arrange / Act / Assert
    expect(MAX_ATTACHMENTS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_ATTACHMENTS)).toBe(true);
  });

  test("MAX_TOTAL_ATTACHMENT_BYTES is a positive integer", () => {
    // Arrange / Act / Assert
    expect(MAX_TOTAL_ATTACHMENT_BYTES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_TOTAL_ATTACHMENT_BYTES)).toBe(true);
  });
});
