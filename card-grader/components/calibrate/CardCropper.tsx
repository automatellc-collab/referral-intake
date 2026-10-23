"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { canvasToDataUrl } from "@/lib/imageUtils";
import type { Rect } from "@/lib/types";

type HandleId = "tl" | "tr" | "bl" | "br";

interface CardCropperProps {
  canvas: HTMLCanvasElement;
  cropRect: Rect;
  onChange: (rect: Rect) => void;
  onConfirm: () => void;
}

const DISPLAY_MAX_WIDTH = 480;

export function CardCropper({ canvas, cropRect, onChange, onConfirm }: CardCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<HandleId | null>(null);
  const dataUrl = useMemo(() => canvasToDataUrl(canvas), [canvas]);
  const scale = Math.min(1, DISPLAY_MAX_WIDTH / canvas.width);
  const displayWidth = canvas.width * scale;
  const displayHeight = canvas.height * scale;

  useEffect(() => {
    if (!activeHandle) return;

    const handleMove = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const x = Math.min(Math.max(0, clientX - bounds.left), displayWidth) / scale;
      const y = Math.min(Math.max(0, clientY - bounds.top), displayHeight) / scale;

      const next = { ...cropRect };
      if (activeHandle === "tl") {
        next.width += next.x - x;
        next.height += next.y - y;
        next.x = x;
        next.y = y;
      } else if (activeHandle === "tr") {
        next.width = x - next.x;
        next.height += next.y - y;
        next.y = y;
      } else if (activeHandle === "bl") {
        next.width += next.x - x;
        next.x = x;
        next.height = y - next.y;
      } else {
        next.width = x - next.x;
        next.height = y - next.y;
      }

      if (next.width > 20 && next.height > 20) {
        onChange(next);
      }
    };

    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY);
    const onPointerUp = () => setActiveHandle(null);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeHandle, cropRect, onChange, scale, displayWidth, displayHeight]);

  const handles: Array<{ id: HandleId; x: number; y: number }> = [
    { id: "tl", x: cropRect.x, y: cropRect.y },
    { id: "tr", x: cropRect.x + cropRect.width, y: cropRect.y },
    { id: "bl", x: cropRect.x, y: cropRect.y + cropRect.height },
    { id: "br", x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
  ];

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="max-w-sm text-center text-sm text-zinc-600 dark:text-zinc-400">
        Drag the corners so the box hugs the card&apos;s outer edge exactly — this is what the centering
        measurement is based on.
      </p>
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ width: displayWidth, height: displayHeight, touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt="Card to crop" className="h-full w-full" draggable={false} />
        <div
          className="absolute border-2 border-blue-500 bg-blue-500/10"
          style={{
            left: cropRect.x * scale,
            top: cropRect.y * scale,
            width: cropRect.width * scale,
            height: cropRect.height * scale,
          }}
        />
        {handles.map((handle) => (
          <div
            key={handle.id}
            onPointerDown={(e) => {
              e.preventDefault();
              setActiveHandle(handle.id);
            }}
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-white bg-blue-500 shadow"
            style={{ left: handle.x * scale, top: handle.y * scale }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Crop looks right — continue
      </button>
    </div>
  );
}
