"use client";

import { useState } from "react";
import Link from "next/link";
import { Microphone, Stethoscope } from "@phosphor-icons/react/dist/ssr";
import { Disclaimer } from "@/components/Disclaimer";
import { ReferralForm } from "@/components/ReferralForm";
import { SummaryPanel } from "@/components/SummaryPanel";
import type { NoteSummary } from "@/lib/schema";
import type { Sample } from "@/lib/samples";
import { withViewTransition } from "@/lib/viewTransition";
import { parseJsonResponse } from "@/lib/parseJsonResponse";
import {
  deleteAttachment,
  isAllowedAttachmentType,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  uploadAttachment,
  type Attachment,
} from "@/lib/attachments";

interface ExtractResponse {
  summary?: NoteSummary;
  specialty?: string;
  error?: string;
}

export default function Home() {
  const [referralText, setReferralText] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [isOtherSpecialty, setIsOtherSpecialty] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [summary, setSummary] = useState<NoteSummary | null>(null);
  const [summarySpecialty, setSummarySpecialty] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referralText,
          specialty,
          attachments: attachments.map((a) => ({ filename: a.filename, mediaType: a.mediaType, url: a.url })),
        }),
      });
      const body = await parseJsonResponse<ExtractResponse>(response);
      if (!response.ok) {
        throw new Error(body.error ?? "Extraction failed.");
      }
      withViewTransition(() => {
        setSummary(body.summary as NoteSummary);
        setSummarySpecialty(body.specialty as string);
        // The server deletes attachments once it has successfully read them —
        // clear them here too so a spent attachment can't be resubmitted.
        setAttachments([]);
        setIsLoading(false);
      });
    } catch (err: unknown) {
      // On failure the server keeps the attachments in place (in case the failure was
      // transient, like a rate limit) so they're left in state here too for a free retry.
      withViewTransition(() => {
        setError(err instanceof Error ? err.message : "Extraction failed.");
        setSummary(null);
        setIsLoading(false);
      });
    }
  }

  async function handleAddFiles(files: FileList) {
    setAttachmentError(null);
    const incoming = Array.from(files);

    if (attachments.length + incoming.length > MAX_ATTACHMENTS) {
      setAttachmentError(`A maximum of ${MAX_ATTACHMENTS} attachments is supported.`);
      return;
    }

    const unsupported = incoming.find((f) => !isAllowedAttachmentType(f.type));
    if (unsupported) {
      setAttachmentError(`"${unsupported.name}" is an unsupported file type. Use PDF, PNG, JPEG, WEBP, or GIF.`);
      return;
    }

    const existingBytes = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
    const incomingBytes = incoming.reduce((sum, f) => sum + f.size, 0);
    if (existingBytes + incomingBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      setAttachmentError(
        `Attachments combined must stay under ${(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)}MB — try fewer or smaller files.`,
      );
      return;
    }

    setIsUploadingAttachments(true);
    try {
      const newAttachments = await Promise.all(incoming.map(uploadAttachment));
      setAttachments((prev) => [...prev, ...newAttachments]);
      setSummary(null);
      setError(null);
    } catch (err: unknown) {
      setAttachmentError(err instanceof Error ? err.message : "Could not upload the selected file(s).");
    } finally {
      setIsUploadingAttachments(false);
    }
  }

  function handleRemoveAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
    void deleteAttachment(url);
  }

  function handleLoadSample(sample: Sample) {
    attachments.forEach((a) => void deleteAttachment(a.url));
    setReferralText(sample.text);
    setSpecialty(sample.specialty);
    setIsOtherSpecialty(false);
    setAttachments([]);
    setAttachmentError(null);
    setSummary(null);
    setError(null);
  }

  function handleSpecialtyChange(next: string) {
    setSpecialty(next);
    setSummary(null);
    setError(null);
  }

  function handleClear() {
    attachments.forEach((a) => void deleteAttachment(a.url));
    setReferralText("");
    setSpecialty("");
    setIsOtherSpecialty(false);
    setAttachments([]);
    setAttachmentError(null);
    setSummary(null);
    setError(null);
  }

  return (
    <div className="wrap">
      <Disclaimer />

      <header className="top">
        <div className="brand">
          <span className="brand-mark">
            <Stethoscope weight="bold" size={22} />
          </span>
          <div className="brand-text">
            <span className="eyebrow">Specialist pre-chart extraction</span>
            <h1>Referral Intake</h1>
          </div>
        </div>
        <p className="top-note">
          Turns a raw referral packet — including attached scans, images, and lab reports — into the pre-chart
          summary a specialist actually needs, with every extracted item traceable back to source and every
          uncertain item flagged for review before it reaches the chart.
        </p>
      </header>

      <p style={{ marginBottom: 20 }}>
        <Link
          href="/encounter"
          className="chip-btn"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Microphone weight="bold" size={13} />
          Try live encounter recording
        </Link>
      </p>

      <div className="board">
        <ReferralForm
          referralText={referralText}
          specialty={specialty}
          isOtherSpecialty={isOtherSpecialty}
          attachments={attachments}
          isLoading={isLoading}
          isUploadingAttachments={isUploadingAttachments}
          attachmentError={attachmentError}
          onTextChange={setReferralText}
          onSpecialtyChange={handleSpecialtyChange}
          onOtherSpecialtyToggle={setIsOtherSpecialty}
          onLoadSample={handleLoadSample}
          onAddFiles={handleAddFiles}
          onRemoveAttachment={handleRemoveAttachment}
          onExtract={handleExtract}
          onClear={handleClear}
        />
        <SummaryPanel summary={summary} specialty={summarySpecialty} isLoading={isLoading} error={error} />
      </div>

      <div className="legend">
        <span className="item">
          <span className="dot" style={{ background: "var(--accent-strong)" }} />
          Extracted — direct quote from the referral
        </span>
        <span className="item">
          <span className="dot" style={{ background: "var(--warn)" }} />
          Inferred — derived from context, confirm before charting
        </span>
        <span className="item">
          <span className="dot" style={{ background: "var(--ink-faint)" }} />
          Not found — flagged as a gap
        </span>
      </div>
    </div>
  );
}
