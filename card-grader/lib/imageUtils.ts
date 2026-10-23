import imageCompression from "browser-image-compression";
import type { Rect } from "./types";

export async function compressImage(file: File): Promise<File> {
  try {
    return await imageCompression(file, {
      maxWidthOrHeight: 1600,
      maxSizeMB: 4,
      useWebWorker: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Image compression failed: ${message}`);
  }
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    image.src = url;
  });
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return ctx;
}

/** Draws the image rotated by `degrees` into a new canvas sized to its rotated bounding box. */
export function drawRotated(image: HTMLImageElement, degrees: number): HTMLCanvasElement {
  const radians = (degrees * Math.PI) / 180;
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const newWidth = Math.abs(w * Math.cos(radians)) + Math.abs(h * Math.sin(radians));
  const newHeight = Math.abs(w * Math.sin(radians)) + Math.abs(h * Math.cos(radians));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(newWidth);
  canvas.height = Math.round(newHeight);
  const ctx = getContext(canvas);

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);

  return canvas;
}

/** Crops a rectangular region of a source canvas into a new, right-sized canvas. */
export function cropCanvas(source: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = getContext(canvas);
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function getImageData(canvas: HTMLCanvasElement): ImageData {
  return getContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Base64-encoded JPEG data with the `data:...;base64,` prefix stripped, for API payloads. */
export function canvasToBase64Jpeg(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
}
