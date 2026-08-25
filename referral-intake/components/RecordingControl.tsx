"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Microphone, NotePencil, Stop, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useSpeechRecognition } from "@/lib/speechRecognition";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface RecordingControlProps {
  onGenerateNote: (transcript: string) => void;
  isGenerating: boolean;
}

export function RecordingControl({ onGenerateNote, isGenerating }: RecordingControlProps) {
  const { isSupported, isListening, transcript, interimTranscript, error, start, stop, reset } =
    useSpeechRecognition();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isListening) {
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isListening]);

  useEffect(() => {
    transcriptBoxRef.current?.scrollTo({ top: transcriptBoxRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, interimTranscript]);

  if (!isSupported) {
    return (
      <div className="empty-state status-text error">
        <span className="icon">
          <WarningCircle weight="bold" size={28} />
        </span>
        Live transcription needs a browser with speech recognition support (Chrome or Edge). Try this feature there.
      </div>
    );
  }

  function handleStart() {
    reset();
    setElapsed(0);
    start();
  }

  return (
    <div>
      <div className="recording-row">
        {!isListening ? (
          <button type="button" className="primary" onClick={handleStart} disabled={isGenerating}>
            <span className="icon">
              <Microphone weight="bold" size={16} />
            </span>
            Start recording
          </button>
        ) : (
          <button type="button" className="primary recording" onClick={stop}>
            <span className="icon">
              <Stop weight="fill" size={16} />
            </span>
            Stop recording
          </button>
        )}
        {isListening && (
          <span className="recording-indicator">
            <Circle weight="fill" size={9} className="pulse-dot" />
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      {error && (
        <div className="status-text error" style={{ marginTop: 10 }}>
          Microphone error: {error}. Check your browser&rsquo;s microphone permission for this site.
        </div>
      )}

      <div className="transcript-box" ref={transcriptBoxRef}>
        {!transcript && !interimTranscript ? (
          <div className="field-value empty">
            {isListening ? "Listening…" : "Transcript will appear here once you start recording."}
          </div>
        ) : (
          <div className="field-value">
            {transcript}
            {interimTranscript && <span className="transcript-interim"> {interimTranscript}</span>}
          </div>
        )}
      </div>

      <div className="extract-row">
        <button
          type="button"
          className="primary"
          disabled={isListening || isGenerating || transcript.trim().length < 20}
          onClick={() => onGenerateNote(transcript)}
        >
          <span className="icon">
            <NotePencil weight="bold" size={16} />
          </span>
          {isGenerating ? "Generating note…" : "Generate encounter note"}
        </button>
      </div>
    </div>
  );
}
