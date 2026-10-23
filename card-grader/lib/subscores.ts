import type { BorderLines, HeuristicSubscoreResult, Rect, RegionFlag, WearSeverity } from "./types";

interface ColorSample {
  luminance: number;
  saturation: number;
}

const SEVERITY_SUBSCORE: Record<WearSeverity, number> = {
  none: 10,
  light: 8,
  moderate: 6,
  heavy: 3,
};

const SEVERITY_ORDER: WearSeverity[] = ["none", "light", "moderate", "heavy"];

function worstSeverity(a: WearSeverity, b: WearSeverity): WearSeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function sampleRegion(imageData: ImageData, rect: Rect): ColorSample {
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));

  let lumSum = 0;
  let satSum = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
      lumSum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      satSum += sat;
      count++;
    }
  }

  if (count === 0) return { luminance: 0, saturation: 0 };
  return { luminance: lumSum / count, saturation: satSum / count };
}

function whiteningMetric(sample: ColorSample, reference: ColorSample): number {
  const lumDelta = sample.luminance - reference.luminance;
  const satDrop = reference.saturation - sample.saturation;
  return Math.max(0, lumDelta * 0.6 + satDrop * 0.4);
}

function severityFromWhiteningMetric(metric: number): WearSeverity {
  if (metric < 0.03) return "none";
  if (metric < 0.08) return "light";
  if (metric < 0.15) return "moderate";
  return "heavy";
}

/**
 * Clean-border reference patch: center of the top margin band, away from
 * any edge or corner. Patch size is capped at a fraction of the margin's
 * own thickness so an imprecisely-calibrated (thin) border can't force the
 * patch to spill into the outer cut edge on one side or the inner border
 * line on the other — a calibration-bleed source that previously caused
 * false whitening/surface readings.
 */
function referenceSample(imageData: ImageData, lines: BorderLines): ColorSample {
  const marginThickness = Math.max(1, lines.top);
  const patch = Math.max(
    4,
    Math.min(
      Math.round(Math.min(lines.cardWidth, lines.cardHeight) * 0.03),
      Math.round(marginThickness * 0.6),
    ),
  );
  const marginMidY = lines.top / 2;
  const rect: Rect = {
    x: lines.cardWidth / 2 - patch / 2,
    y: Math.max(0, marginMidY - patch / 2),
    width: patch,
    height: patch,
  };
  return sampleRegion(imageData, rect);
}

/**
 * Heuristic corner-whitening detector. Samples small patches at the four
 * physical corners of the cropped card (near the outer cut edge) and
 * compares luminance/saturation against a clean-border reference patch.
 * This is a rough, low-confidence estimate — not a substitute for visual
 * inspection under good lighting.
 */
export function detectCornerWear(imageData: ImageData, lines: BorderLines): HeuristicSubscoreResult {
  const { cardWidth, cardHeight } = lines;
  const patch = Math.max(8, Math.round(Math.min(cardWidth, cardHeight) * 0.05));
  const inset = Math.max(2, Math.round(patch * 0.2));

  const corners: Record<string, Rect> = {
    "top-left": { x: inset, y: inset, width: patch, height: patch },
    "top-right": { x: cardWidth - inset - patch, y: inset, width: patch, height: patch },
    "bottom-left": { x: inset, y: cardHeight - inset - patch, width: patch, height: patch },
    "bottom-right": { x: cardWidth - inset - patch, y: cardHeight - inset - patch, width: patch, height: patch },
  };

  const reference = referenceSample(imageData, lines);
  const flags: RegionFlag[] = [];
  let worst: WearSeverity = "none";

  for (const [region, rect] of Object.entries(corners)) {
    const sample = sampleRegion(imageData, rect);
    const severity = severityFromWhiteningMetric(whiteningMetric(sample, reference));
    flags.push({ region, severity });
    worst = worstSeverity(worst, severity);
  }

  return { subscore: SEVERITY_SUBSCORE[worst], worstSeverity: worst, flags };
}

/**
 * Heuristic edge-whitening detector. Samples thin strips along the middle
 * portion of each of the four outer edges (skipping the near-corner zones,
 * which are covered by detectCornerWear) and compares against the same
 * clean-border reference. Rough, low-confidence estimate.
 */
export function detectEdgeWear(imageData: ImageData, lines: BorderLines): HeuristicSubscoreResult {
  const { cardWidth, cardHeight } = lines;
  const thickness = Math.max(6, Math.round(Math.min(cardWidth, cardHeight) * 0.03));
  const inset = Math.max(2, Math.round(thickness * 0.4));
  const marginFraction = 0.22;

  const edges: Record<string, Rect> = {
    top: {
      x: cardWidth * marginFraction,
      y: inset,
      width: cardWidth * (1 - 2 * marginFraction),
      height: thickness,
    },
    bottom: {
      x: cardWidth * marginFraction,
      y: cardHeight - inset - thickness,
      width: cardWidth * (1 - 2 * marginFraction),
      height: thickness,
    },
    left: {
      x: inset,
      y: cardHeight * marginFraction,
      width: thickness,
      height: cardHeight * (1 - 2 * marginFraction),
    },
    right: {
      x: cardWidth - inset - thickness,
      y: cardHeight * marginFraction,
      width: thickness,
      height: cardHeight * (1 - 2 * marginFraction),
    },
  };

  const reference = referenceSample(imageData, lines);
  const flags: RegionFlag[] = [];
  let worst: WearSeverity = "none";

  for (const [region, rect] of Object.entries(edges)) {
    const sample = sampleRegion(imageData, rect);
    const severity = severityFromWhiteningMetric(whiteningMetric(sample, reference));
    flags.push({ region, severity });
    worst = worstSeverity(worst, severity);
  }

  return { subscore: SEVERITY_SUBSCORE[worst], worstSeverity: worst, flags };
}

function toGray(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function averageTileGradient(imageData: ImageData, x0: number, y0: number, x1: number, y1: number): number {
  const { data, width, height } = imageData;
  const step = 2;
  let sum = 0;
  let count = 0;
  const xEnd = Math.min(width - 1, x1);
  const yEnd = Math.min(height - 1, y1);

  for (let y = Math.max(0, y0); y < yEnd; y += step) {
    for (let x = Math.max(0, x0); x < xEnd; x += step) {
      const i = (y * width + x) * 4;
      const iRight = (y * width + (x + 1)) * 4;
      const iDown = ((y + 1) * width + x) * 4;
      const gray = toGray(data, i);
      sum += Math.abs(toGray(data, iRight) - gray) + Math.abs(toGray(data, iDown) - gray);
      count++;
    }
  }

  return count === 0 ? 0 : sum / count;
}

/** Coefficient of variation of per-tile gradient magnitude: smooth, uniform surfaces score low; localized scratches/print defects spike it. */
function computeGradientCoefficientOfVariation(imageData: ImageData, rect: Rect): number {
  const tilesX = 10;
  const tilesY = 10;
  const tileW = rect.width / tilesX;
  const tileH = rect.height / tilesY;
  const magnitudes: number[] = [];

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = Math.round(rect.x + tx * tileW);
      const y0 = Math.round(rect.y + ty * tileH);
      const x1 = Math.round(rect.x + (tx + 1) * tileW);
      const y1 = Math.round(rect.y + (ty + 1) * tileH);
      magnitudes.push(averageTileGradient(imageData, x0, y0, x1, y1));
    }
  }

  const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  if (mean === 0) return 0;
  const variance = magnitudes.reduce((a, b) => a + (b - mean) ** 2, 0) / magnitudes.length;
  return Math.sqrt(variance) / mean;
}

function severityFromCV(cv: number): WearSeverity {
  if (cv < 0.35) return "none";
  if (cv < 0.6) return "light";
  if (cv < 1.0) return "moderate";
  return "heavy";
}

/** Fraction of the interior region's own size pulled in from each border line before sampling. */
const SURFACE_SAFETY_INSET_FRACTION = 0.04;

/**
 * Heuristic surface-irregularity detector. Looks inside the calibrated
 * inner-border area (the card's art/text field) for localized texture
 * spikes that could indicate scratches, scuffing, or print defects.
 * Rough, low-confidence estimate — cannot distinguish print texture from
 * genuine surface damage, and is excluded from the overall grade by
 * default (see lib/grade.ts) until a trusted source (user or AI) confirms
 * it.
 *
 * The sampled rect is inset inward from the user-calibrated border lines
 * by a small safety margin. Without this, a border line placed even a few
 * pixels off from the true printed border lets the hard color edge of the
 * border itself fall inside the "interior" sample, which reads as a huge
 * gradient spike and produces a false "heavy wear" result regardless of
 * the card's actual condition.
 */
export function detectSurfaceIrregularity(imageData: ImageData, lines: BorderLines): HeuristicSubscoreResult {
  const rawWidth = lines.right - lines.left;
  const rawHeight = lines.bottom - lines.top;

  if (rawWidth <= 0 || rawHeight <= 0) {
    return { subscore: 10, worstSeverity: "none", flags: [{ region: "surface", severity: "none" }] };
  }

  const insetX = rawWidth * SURFACE_SAFETY_INSET_FRACTION;
  const insetY = rawHeight * SURFACE_SAFETY_INSET_FRACTION;
  const rect: Rect = {
    x: lines.left + insetX,
    y: lines.top + insetY,
    width: Math.max(1, rawWidth - insetX * 2),
    height: Math.max(1, rawHeight - insetY * 2),
  };

  const cv = computeGradientCoefficientOfVariation(imageData, rect);
  const severity = severityFromCV(cv);

  return { subscore: SEVERITY_SUBSCORE[severity], worstSeverity: severity, flags: [{ region: "surface", severity }] };
}
