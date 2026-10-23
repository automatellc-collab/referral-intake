"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { canvasToDataUrl } from "@/lib/imageUtils";
import type { BorderLines } from "@/lib/types";
import { Magnifier } from "./Magnifier";

type LineId = "top" | "bottom" | "left" | "right";

interface BorderLineCalibratorProps {
  canvas: HTMLCanvasElement;
  lines: BorderLines;
  onChange: (lines: BorderLines) => void;
  onConfirm: () => void;
}

const DISPLAY_MAX_WIDTH = 480;

export function BorderLineCalibrator({ canvas, lines, onChange, onConfirm }: BorderLineCalibratorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeLine, setActiveLine] = useState<LineId | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const dataUrl = useMemo(() => canvasToDataUrl(canvas), [canvas]);
  const scale = Math.min(1, DISPLAY_MAX_WIDTH / canvas.width);
  const displayWidth = canvas.width * scale;
  const displayHeight = canvas.height * scale;

  useEffect(() => {
    if (!activeLine) return;

    const handleMove = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const localX = Math.min(Math.max(0, clientX - bounds.left), displayWidth);
      const localY = Math.min(Math.max(0, clientY - bounds.top), displayHeight);
      setPointerPos({ x: localX, y: localY });

      const x = localX / scale;
      const y = localY / scale;

      const next = { ...lines };
      if (activeLine === "top") next.top = Math.min(y, next.bottom - 4);
      if (activeLine === "bottom") next.bottom = Math.max(y, next.top + 4);
      if (activeLine === "left") next.left = Math.min(x, next.right - 4);
      if (activeLine === "right") next.right = Math.max(x, next.left + 4);
      onChange(next);
    };

    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY);
    const onPointerUp = () => {
      setActiveLine(null);
      setPointerPos(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeLine, lines, onChange, scale, displayWidth, displayHeight]);

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="max-w-sm text-center text-sm text-zinc-600 dark:text-zinc-400">
        Drag each guideline to the inner edge of the card&apos;s printed border — where the art or text
        frame begins.
      </p>
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ width: displayWidth, height: displayHeight, touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt="Card to calibrate" className="h-full w-full" draggable={false} />

        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setActiveLine("top");
          }}
          className="absolute left-0 right-0 flex h-5 -translate-y-1/2 cursor-row-resize items-center"
          style={{ top: lines.top * scale }}
        >
          <div className="h-0.5 w-full bg-emerald-500" />
        </div>
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setActiveLine("bottom");
          }}
          className="absolute left-0 right-0 flex h-5 -translate-y-1/2 cursor-row-resize items-center"
          style={{ top: lines.bottom * scale }}
        >
          <div className="h-0.5 w-full bg-emerald-500" />
        </div>
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setActiveLine("left");
          }}
          className="absolute top-0 bottom-0 flex w-5 -translate-x-1/2 items-center justify-center cursor-col-resize"
          style={{ left: lines.left * scale }}
        >
          <div className="h-full w-0.5 bg-emerald-500" />
        </div>
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setActiveLine("right");
          }}
          className="absolute top-0 bottom-0 flex w-5 -translate-x-1/2 items-center justify-center cursor-col-resize"
          style={{ left: lines.right * scale }}
        >
          <div className="h-full w-0.5 bg-emerald-500" />
        </div>

        {pointerPos && (
          <Magnifier dataUrl={dataUrl} containerWidth={displayWidth} containerHeight={displayHeight} point={pointerPos} />
        )}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Borders look right — analyze
      </button>
    </div>
  );
}
