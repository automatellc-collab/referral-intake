import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useSpeechRecognition } from "./speechRecognition";

let activeRecognition: FakeSpeechRecognition | null = null;

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((ev: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();

  constructor() {
    // Capture the instance the hook constructs so tests can drive its callbacks directly.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeRecognition = this;
  }
}

function fakeResultEvent(chunks: Array<{ transcript: string; isFinal: boolean }>): SpeechRecognitionEvent {
  const results = chunks.map((chunk) => {
    const alt = [{ transcript: chunk.transcript }];
    return Object.assign(alt, { isFinal: chunk.isFinal, item: (i: number) => alt[i] });
  });
  return {
    resultIndex: 0,
    results: Object.assign(results, { item: (i: number) => results[i] }),
  } as unknown as SpeechRecognitionEvent;
}

beforeEach(() => {
  activeRecognition = null;
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSpeechRecognition", () => {
  test("reports supported once mounted with a SpeechRecognition constructor present", () => {
    // Arrange / Act
    const { result } = renderHook(() => useSpeechRecognition());

    // Assert
    expect(result.current.isSupported).toBe(true);
  });

  test("reports unsupported when no SpeechRecognition constructor exists", () => {
    // Arrange
    vi.unstubAllGlobals();

    // Act
    const { result } = renderHook(() => useSpeechRecognition());

    // Assert
    expect(result.current.isSupported).toBe(false);
  });

  test("start() marks listening and invokes the recognizer's start()", () => {
    // Arrange
    const { result } = renderHook(() => useSpeechRecognition());

    // Act
    act(() => result.current.start());

    // Assert
    expect(result.current.isListening).toBe(true);
    expect(activeRecognition?.start).toHaveBeenCalledTimes(1);
  });

  test("stop() marks not-listening and does not restart on end", () => {
    // Arrange
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());

    // Act
    act(() => result.current.stop());

    // Assert
    expect(result.current.isListening).toBe(false);
    expect(activeRecognition?.start).toHaveBeenCalledTimes(1);
  });

  test("restarts the recognizer when it ends unexpectedly while still listening", () => {
    // Arrange
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());

    // Act — simulate Chrome auto-stopping after a pause, without stop() having been called
    act(() => activeRecognition?.onend?.());

    // Assert
    expect(activeRecognition?.start).toHaveBeenCalledTimes(2);
    expect(result.current.isListening).toBe(true);
  });

  test("accumulates final results into transcript and tracks interim results separately", () => {
    // Arrange
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());

    // Act
    act(() =>
      activeRecognition?.onresult?.(
        fakeResultEvent([
          { transcript: "the patient reports headache", isFinal: true },
          { transcript: "for two", isFinal: false },
        ]),
      ),
    );

    // Assert
    expect(result.current.transcript).toBe("the patient reports headache");
    expect(result.current.interimTranscript).toBe("for two");
  });

  test("ignores no-speech errors but surfaces other errors", () => {
    // Arrange
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());

    // Act
    act(() => activeRecognition?.onerror?.({ error: "no-speech" } as SpeechRecognitionErrorEvent));

    // Assert
    expect(result.current.error).toBeNull();

    // Act
    act(() => activeRecognition?.onerror?.({ error: "audio-capture" } as SpeechRecognitionErrorEvent));

    // Assert
    expect(result.current.error).toBe("audio-capture");
  });

  test("stops listening when the microphone permission is denied", () => {
    // Arrange
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());

    // Act
    act(() => activeRecognition?.onerror?.({ error: "not-allowed" } as SpeechRecognitionErrorEvent));

    // Assert
    expect(result.current.error).toBe("not-allowed");
    expect(result.current.isListening).toBe(false);
  });

  test("reset() clears transcript, interim transcript, and error", () => {
    // Arrange
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => activeRecognition?.onresult?.(fakeResultEvent([{ transcript: "hello", isFinal: true }])));
    act(() => activeRecognition?.onerror?.({ error: "audio-capture" } as SpeechRecognitionErrorEvent));

    // Act
    act(() => result.current.reset());

    // Assert
    expect(result.current.transcript).toBe("");
    expect(result.current.interimTranscript).toBe("");
  });
});
