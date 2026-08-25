"use client";

import { useState } from "react";
import { CircleNotch, CloudArrowUp, FileImage, FilePdf, MagicWand, X } from "@phosphor-icons/react/dist/ssr";
import { SAMPLES, type Sample } from "@/lib/samples";
import { OTHER_SPECIALTY, SPECIALTIES } from "@/lib/specialties";
import { MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES, type Attachment } from "@/lib/attachments";

interface ReferralFormProps {
  referralText: string;
  specialty: string;
  isOtherSpecialty: boolean;
  attachments: Attachment[];
  isLoading: boolean;
  attachmentError: string | null;
  onTextChange: (text: string) => void;
  onSpecialtyChange: (specialty: string) => void;
  onOtherSpecialtyToggle: (isOther: boolean) => void;
  onLoadSample: (sample: Sample) => void;
  onAddFiles: (files: FileList) => void;
  onRemoveAttachment: (filename: string) => void;
  onExtract: () => void;
  onClear: () => void;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mediaType }: { mediaType: Attachment["mediaType"] }) {
  return mediaType === "application/pdf" ? (
    <FilePdf weight="bold" size={13} />
  ) : (
    <FileImage weight="bold" size={13} />
  );
}

export function ReferralForm({
  referralText,
  specialty,
  isOtherSpecialty,
  attachments,
  isLoading,
  attachmentError,
  onTextChange,
  onSpecialtyChange,
  onOtherSpecialtyToggle,
  onLoadSample,
  onAddFiles,
  onRemoveAttachment,
  onExtract,
  onClear,
}: ReferralFormProps) {
  const [isDragging, setIsDragging] = useState(false);

  const canExtract = specialty.trim().length > 0 && (referralText.trim().length > 0 || attachments.length > 0) && !isLoading;
  const canAddMore = attachments.length < MAX_ATTACHMENTS && !isLoading;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Incoming referral</h2>
      </div>
      <div className="panel-body">
        <label className="field-label" htmlFor="specialty-select" style={{ display: "block", marginBottom: 6 }}>
          Specialty
        </label>
        {isOtherSpecialty ? (
          <input
            type="text"
            className="specialty-input"
            placeholder="Type the specialty…"
            autoFocus
            value={specialty}
            disabled={isLoading}
            onChange={(event) => onSpecialtyChange(event.target.value)}
          />
        ) : (
          <select
            id="specialty-select"
            className="specialty-select"
            value={specialty}
            disabled={isLoading}
            onChange={(event) => {
              if (event.target.value === OTHER_SPECIALTY) {
                onOtherSpecialtyToggle(true);
                onSpecialtyChange("");
              } else {
                onSpecialtyChange(event.target.value);
              }
            }}
          >
            <option value="" disabled>
              Select a specialty…
            </option>
            {SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={OTHER_SPECIALTY}>Other…</option>
          </select>
        )}

        <div className="samples" style={{ marginTop: 14 }}>
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              className="chip-btn"
              disabled={isLoading}
              onClick={() => onLoadSample(sample)}
            >
              {sample.label}
            </button>
          ))}
          <button type="button" className="chip-btn ghost" disabled={isLoading} onClick={onClear}>
            Clear
          </button>
        </div>

        <textarea
          id="raw"
          placeholder="Paste a referral letter or cover note here (optional if you attach documents below)…"
          value={referralText}
          onChange={(event) => onTextChange(event.target.value)}
          disabled={isLoading}
        />

        <div className="field-label" style={{ marginTop: 14, marginBottom: 6 }}>
          Attached documents
        </div>

        <label
          className={`dropzone${isDragging ? " dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (canAddMore) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (canAddMore && event.dataTransfer.files.length > 0) onAddFiles(event.dataTransfer.files);
          }}
        >
          <span className="icon">
            <CloudArrowUp weight="light" size={26} />
          </span>
          <span className="dropzone-title">Drop files or click to browse</span>
          <span className="dropzone-hint">
            PDF, PNG, JPEG, WEBP, GIF — up to {MAX_ATTACHMENTS} files, {formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}{" "}
            combined
          </span>
          <input
            type="file"
            className="dropzone-input"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            multiple
            disabled={!canAddMore}
            onChange={(event) => {
              if (event.target.files) onAddFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        {attachments.length > 0 && (
          <div className="chip-list" style={{ marginTop: 10 }}>
            {attachments.map((attachment) => (
              <span className="data-chip removable" key={attachment.filename}>
                <span className="icon">
                  <AttachmentIcon mediaType={attachment.mediaType} />
                </span>
                {attachment.filename}
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`Remove ${attachment.filename}`}
                  onClick={() => onRemoveAttachment(attachment.filename)}
                  disabled={isLoading}
                >
                  <X weight="bold" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {attachmentError && (
          <div className="status-text error" style={{ marginTop: 6 }}>
            {attachmentError}
          </div>
        )}

        <div className="extract-row">
          <button type="button" className="primary" disabled={!canExtract} onClick={onExtract}>
            <span className="icon">
              {isLoading ? <CircleNotch className="spin" weight="bold" size={16} /> : <MagicWand weight="bold" size={16} />}
            </span>
            {isLoading ? "Extracting…" : "Extract pre-chart summary"}
          </button>
        </div>

        <div className="arch-note">
          <strong>How this works:</strong> the referral text and any attached documents are sent to Claude, which
          extracts them into a consult-note-style summary for the selected specialty. Nothing is stored — each
          request is stateless.
        </div>
      </div>
    </section>
  );
}
