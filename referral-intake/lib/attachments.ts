import { upload } from "@vercel/blob/client";

export type AttachmentMediaType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface Attachment {
  filename: string;
  mediaType: AttachmentMediaType;
  url: string;
  pathname: string;
  /**
   * Size in bytes as reported by the browser at upload time. Used for the
   * pre-upload combined-size check; the server re-derives an authoritative
   * figure from Vercel Blob's own metadata rather than trusting this value.
   */
  sizeBytes: number;
}

export const ALLOWED_ATTACHMENT_TYPES: AttachmentMediaType[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const MAX_ATTACHMENTS = 5;

// Attachments upload directly from the browser to Vercel Blob storage, bypassing
// the 4.5MB request body limit that applies to Vercel Functions. Since blob URLs
// are sent to Claude (not base64-encoded file bytes), storage is not constrained
// by request size limits. Vercel Blob supports multi-GB files.
export const MAX_TOTAL_ATTACHMENT_BYTES = 1024 * 1024 * 1024; // 1GB

const PRIVATE_BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";

export function isAllowedAttachmentType(mediaType: string): mediaType is AttachmentMediaType {
  return (ALLOWED_ATTACHMENT_TYPES as string[]).includes(mediaType);
}

/**
 * True when a URL points at this app's own private Vercel Blob store — the only
 * kind of attachment URL the server should ever fetch or delete on a client's say-so.
 */
export function isOwnedBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Best-effort cleanup for a blob the user no longer needs (removed before
 * extracting, or a new sample/clear replaced it). Never throws — a failed
 * delete just leaves an orphaned blob rather than breaking the UI.
 */
export async function deleteAttachment(url: string): Promise<void> {
  try {
    await fetch("/api/attachments/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    // Best-effort cleanup; ignore network failures.
  }
}

export async function uploadAttachment(file: File): Promise<Attachment> {
  const pathname = `attachments/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const blob = await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/attachments/upload-url",
    contentType: file.type,
  });
  return {
    filename: file.name,
    mediaType: file.type as AttachmentMediaType,
    url: blob.url,
    pathname: blob.pathname,
    sizeBytes: file.size,
  };
}
