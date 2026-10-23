import "server-only";

export type DocumentFormat = "native-pdf" | "scanned-pdf" | "email" | "plain-text" | "form" | "handwritten";

export async function detectFormat(content: string, filename: string): Promise<{
  format: DocumentFormat;
  confidence: number;
  characteristics: string[];
}> {
  const characteristics: string[] = [];

  // Check for email headers
  if (content.includes("From:") && content.includes("Subject:") && content.includes("Date:")) {
    return {
      format: "email",
      confidence: 0.95,
      characteristics: ["email-headers", "possible-forwarded-chain"],
    };
  }

  // Check for form fields (e.g., [ ] checkboxes, underlines for fill-in)
  const formPatterns = [/\[\s*\]/g, /__+/g, /\(   \)/g]; // checkboxes, underlines, circles
  const formMatches = formPatterns.reduce((acc, pattern) => acc + (content.match(pattern) || []).length, 0);

  if (formMatches > 5) {
    return {
      format: "form",
      confidence: 0.85,
      characteristics: ["form-fields", "structured-layout"],
    };
  }

  // Check for plain text (no formatting)
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return {
      format: "plain-text",
      confidence: 0.9,
      characteristics: ["no-pdf-markers"],
    };
  }

  // Heuristics for native vs scanned PDF
  // Native PDFs tend to have better formatting, fewer OCR artifacts
  const ocr_artifacts = [/[l1|]/g, /[O0]/g, /[\s]{2,}/g].reduce(
    (acc, pattern) => acc + (content.match(pattern) || []).length,
    0,
  );

  if (ocr_artifacts > content.length * 0.05) {
    // More than 5% OCR artifacts
    return {
      format: "scanned-pdf",
      confidence: 0.8,
      characteristics: ["ocr-artifacts", "possible-handwriting"],
    };
  }

  return {
    format: "native-pdf",
    confidence: 0.85,
    characteristics: ["clean-text", "structured-content"],
  };
}

export function extractEmailMetadata(content: string): {
  sender?: string;
  subject?: string;
  date?: string;
  body: string;
} {
  const lines = content.split("\n");
  const metadata: Record<string, string> = {};
  let bodyStart = 0;

  // Parse email headers
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const line = lines[i];
    if (!line.trim()) {
      bodyStart = i + 1;
      break;
    }

    if (line.startsWith("From:")) {
      metadata.sender = line.replace("From:", "").trim();
    } else if (line.startsWith("Subject:")) {
      metadata.subject = line.replace("Subject:", "").trim();
    } else if (line.startsWith("Date:")) {
      metadata.date = line.replace("Date:", "").trim();
    }
  }

  const body = lines.slice(bodyStart).join("\n").trim();

  return {
    sender: metadata.sender,
    subject: metadata.subject,
    date: metadata.date,
    body,
  };
}

export function cleanOCRErrors(text: string): string {
  let cleaned = text;

  // Common OCR substitutions
  const corrections: [RegExp, string][] = [
    [/[l1]\|/g, "I"], // "l1|" → "I"
    [/[O0]([A-Z])/g, "0$1"], // "O" before numbers → "0"
    [/rn/g, "m"], // "rn" → "m" in some fonts
    [/vv/g, "w"], // "vv" → "w"
    [/([0-9])\s+([0-9])/g, "$1$2"], // Remove spaces between consecutive digits
  ];

  for (const [pattern, replacement] of corrections) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned;
}

export function normalizeWhitespace(text: string): string {
  return (
    text
      // Remove excessive whitespace
      .replace(/\n{3,}/g, "\n\n")
      // Normalize spaces
      .replace(/[ \t]+/g, " ")
      // Clean up lines
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n")
  );
}

export function extractFormsData(content: string): Record<string, string> {
  const data: Record<string, string> = {};
  const lines = content.split("\n");

  // Look for "Label: ___" or "Label: [ ]" patterns
  const formFieldPattern = /(.+?):\s*(?:\[?\s*\]?|__+)/g;
  let match;

  while ((match = formFieldPattern.exec(content)) !== null) {
    const label = match[1].trim();
    // Find the next line for the value
    const lineIndex = content.substring(0, match.index).split("\n").length - 1;
    const nextLine = lines[lineIndex + 1]?.trim();

    if (nextLine && !nextLine.match(/^[_\[\]]/)) {
      data[label] = nextLine;
    }
  }

  return data;
}

export function detectHandwriting(content: string): { hasHandwriting: boolean; confidence: number } {
  // Heuristics for detecting handwritten content
  // - Irregular formatting
  // - Mixed case inconsistencies
  // - Punctuation inconsistencies

  const lines = content.split("\n");

  // Check for irregular line lengths (handwritten = inconsistent)
  const lineLengths = lines.map((l) => l.length);
  const avgLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length;
  const variance = lineLengths.reduce((acc, len) => acc + Math.pow(len - avgLength, 2), 0) / lineLengths.length;
  const stdDev = Math.sqrt(variance);

  // High variance suggests handwriting
  const hasHighVariance = stdDev > avgLength * 0.5;

  // Check for mixed capitalization within words (handwriting trait)
  const mixedCaseCount = (content.match(/[a-z][A-Z]/g) || []).length;
  const hasMixedCase = mixedCaseCount > content.length * 0.02;

  const confidence = (hasHighVariance ? 0.4 : 0) + (hasMixedCase ? 0.5 : 0);

  return {
    hasHandwriting: confidence > 0.5,
    confidence: Math.min(confidence, 1.0),
  };
}
