import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const parseMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { parse: parseMock };
  },
}));

const { generateEncounterNote } = await import("./generateEncounterNote");

beforeEach(() => {
  parseMock.mockReset();
});

describe("generateEncounterNote", () => {
  test("sends the transcript to Claude with the scribe system prompt", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: { summary: "..." } });

    // Act
    await generateEncounterNote("Doctor: how have you been feeling? Patient: much better, thanks.");

    // Assert
    const call = parseMock.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-5");
    expect(call.system).toContain("scribe");
    expect(call.messages[0].content).toContain("much better, thanks.");
  });

  test("returns the parsed output on success", async () => {
    // Arrange
    const parsedOutput = { summary: "Follow-up visit.", plan: ["Continue current regimen."] };
    parseMock.mockResolvedValue({ parsed_output: parsedOutput });

    // Act
    const result = await generateEncounterNote("some transcript");

    // Assert
    expect(result).toBe(parsedOutput);
  });

  test("throws when Claude does not return a parseable structured note", async () => {
    // Arrange
    parseMock.mockResolvedValue({ parsed_output: null });

    // Act
    const act = () => generateEncounterNote("some transcript");

    // Assert
    await expect(act).rejects.toThrow(/parseable structured note/i);
  });
});
