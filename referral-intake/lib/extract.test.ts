import { describe, expect, test, vi, beforeEach } from "vitest";
import type { Attachment } from "./attachments";

vi.mock("server-only", () => ({}));

const parseMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { parse: parseMock };
  },
}));

const { extractSummary } = await import("./extract");

beforeEach(() => {
  parseMock.mockReset();
});

describe("extractSummary", () => {
  test("sends the specialty-specific system prompt and cover text", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: { openingNarrative: { status: "missing", value: "" } } });

    // Act
    await extractSummary("Cardiology", "Reason for referral: chest pain.");

    // Assert
    const call = parseMock.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-5");
    expect(call.system).toContain("Cardiology");
    const textBlock = call.messages[0].content.at(-1);
    expect(textBlock.type).toBe("text");
    expect(textBlock.text).toContain("Reason for referral: chest pain.");
  });

  test("notes the absence of cover text when only attachments are provided", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: {} });

    // Act
    await extractSummary("Dermatology", "");

    // Assert
    const call = parseMock.mock.calls[0][0];
    const textBlock = call.messages[0].content.at(-1);
    expect(textBlock.text).toContain("no cover text");
  });

  test("converts a PDF attachment into a document content block", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: {} });
    const attachments: Attachment[] = [{ filename: "report.pdf", mediaType: "application/pdf", base64: "aGVsbG8=" }];

    // Act
    await extractSummary("Neurology", "cover text", attachments);

    // Assert
    const call = parseMock.mock.calls[0][0];
    const content = call.messages[0].content;
    expect(content[0]).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "aGVsbG8=" },
    });
  });

  test("converts an image attachment into an image content block", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: {} });
    const attachments: Attachment[] = [{ filename: "scan.png", mediaType: "image/png", base64: "aGVsbG8=" }];

    // Act
    await extractSummary("Radiology", "cover text", attachments);

    // Assert
    const call = parseMock.mock.calls[0][0];
    const content = call.messages[0].content;
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
    });
  });

  test("mentions attached filenames in the instruction text when attachments are present", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: {} });
    const attachments: Attachment[] = [{ filename: "labs.png", mediaType: "image/png", base64: "aGVsbG8=" }];

    // Act
    await extractSummary("Endocrinology", "cover text", attachments);

    // Assert
    const call = parseMock.mock.calls[0][0];
    const textBlock = call.messages[0].content.at(-1);
    expect(textBlock.text).toContain("labs.png");
  });

  test("returns the parsed output on success", async () => {
    // Arrange
    const parsedOutput = { openingNarrative: { status: "extracted", value: "..." } };
    parseMock.mockResolvedValue({ parsed_output: parsedOutput });

    // Act
    const result = await extractSummary("Cardiology", "text");

    // Assert
    expect(result).toBe(parsedOutput);
  });

  test("throws when Claude does not return a parseable structured summary", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: null });

    // Act
    const act = () => extractSummary("Cardiology", "text");

    // Assert
    await expect(act).rejects.toThrow(/parseable structured summary/i);
  });
});
