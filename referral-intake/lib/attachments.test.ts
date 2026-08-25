import { afterEach, describe, expect, test, vi } from "vitest";
import { fileToAttachment, isAllowedAttachmentType, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS } from "./attachments";

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

describe("fileToAttachment", () => {
  test("resolves with filename, mediaType, and base64-encoded content", async () => {
    // Arrange
    const file = new File(["hello world"], "referral.pdf", { type: "application/pdf" });

    // Act
    const attachment = await fileToAttachment(file);

    // Assert
    expect(attachment.filename).toBe("referral.pdf");
    expect(attachment.mediaType).toBe("application/pdf");
    expect(atob(attachment.base64)).toBe("hello world");
  });

  test("strips the data URL prefix from the base64 payload", async () => {
    // Arrange
    const file = new File(["x"], "note.png", { type: "image/png" });

    // Act
    const attachment = await fileToAttachment(file);

    // Assert
    expect(attachment.base64.startsWith("data:")).toBe(false);
  });

  test("rejects with a descriptive error when the file cannot be read", async () => {
    // Arrange
    const OriginalFileReader = globalThis.FileReader;
    class FailingFileReader extends OriginalFileReader {
      readAsDataURL() {
        this.onerror?.(new ProgressEvent("error") as never);
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);
    const file = new File(["x"], "corrupt.pdf", { type: "application/pdf" });

    // Act
    const act = fileToAttachment(file);

    // Assert
    await expect(act).rejects.toThrow(/could not read file "corrupt\.pdf"/i);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("constants", () => {
  test("MAX_ATTACHMENTS is a positive integer", () => {
    // Arrange / Act / Assert
    expect(MAX_ATTACHMENTS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_ATTACHMENTS)).toBe(true);
  });
});
