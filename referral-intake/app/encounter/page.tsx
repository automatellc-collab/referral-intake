"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Microphone, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { RecordingControl } from "@/components/RecordingControl";
import { EncounterNotePanel } from "@/components/EncounterNotePanel";
import type { EncounterNote } from "@/lib/encounterSchema";
import { parseJsonResponse } from "@/lib/parseJsonResponse";

interface EncounterNoteResponse {
  note?: EncounterNote;
  error?: string;
}

export default function EncounterPage() {
  const [note, setNote] = useState<EncounterNote | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateNote(transcript: string) {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/encounter-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const body = await parseJsonResponse<EncounterNoteResponse>(response);
      if (!response.ok) {
        throw new Error(body.error ?? "Note generation failed.");
      }
      setNote(body.note as EncounterNote);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Note generation failed.");
      setNote(null);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="wrap">
      <div className="disclaimer" role="note">
        <span className="icon">
          <WarningCircle weight="fill" size={18} />
        </span>
        <span>
          <strong>Demo only — requires the patient&rsquo;s explicit consent to record, and do not use with real
          patient audio.</strong> Many states legally require every party&rsquo;s consent before a conversation is
          recorded. Speech is processed by your browser&rsquo;s speech recognition service (not Anthropic), and the
          resulting transcript is sent to Claude to draft a note. Use synthetic or role-played encounters while
          evaluating this feature.
        </span>
      </div>

      <header className="top">
        <div className="brand">
          <span className="brand-mark">
            <Microphone weight="bold" size={22} />
          </span>
          <div className="brand-text">
            <span className="eyebrow">Live encounter documentation</span>
            <h1>Ambient Scribe</h1>
          </div>
        </div>
        <p className="top-note">
          Turn on recording during a consult and get a live transcript, then a structured draft note — vitals, exam
          findings, assessment, and plan — pulled only from what was actually said.
        </p>
      </header>

      <p style={{ marginBottom: 20 }}>
        <Link href="/" className="chip-btn ghost" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft weight="bold" size={13} />
          Back to Referral Intake
        </Link>
      </p>

      <div className="board">
        <section className="panel">
          <div className="panel-head">
            <h2>Recording</h2>
          </div>
          <div className="panel-body">
            <RecordingControl onGenerateNote={handleGenerateNote} isGenerating={isGenerating} />
          </div>
        </section>

        <EncounterNotePanel note={note} isLoading={isGenerating} error={error} />
      </div>
    </div>
  );
}
