export type AttachmentMediaType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface Attachment {
  filename: string;
  mediaType: AttachmentMediaType;
  base64: string;
  /**
   * Original file size in bytes, before base64 encoding. Populated client-side
   * for the pre-upload combined-size check; optional because the server
   * re-derives an authoritative figure from the actual base64 payload length
   * rather than trusting this value.
   */
  sizeBytes?: number;
}

export const ALLOWED_ATTACHMENT_TYPES: AttachmentMediaType[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const MAX_ATTACHMENTS = 5;

// Vercel Functions hard-cap the request body at 4.5MB (not configurable —
// https://vercel.com/docs/functions/limitations#request-body-size). Attachments
// are sent as base64 (~1.33x the raw byte size) inside that same JSON body
// alongside the referral text, so the real, binding constraint is the combined
// raw size of every attachment in one request — not any single file's size.
// 3MB raw stays safely under the 4.5MB cap after base64 inflation.
export const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export function isAllowedAttachmentType(mediaType: string): mediaType is AttachmentMediaType {
  return (ALLOWED_ATTACHMENT_TYPES as string[]).includes(mediaType);
}

export function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read file "${file.name}".`));
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.slice(result.indexOf(",") + 1);
      resolve({ filename: file.name, mediaType: file.type as AttachmentMediaType, base64, sizeBytes: file.size });
    };
    reader.readAsDataURL(file);
  });
}
