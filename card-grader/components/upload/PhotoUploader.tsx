"use client";

import { useCallback, useRef, useState } from "react";

interface PhotoUploaderProps {
  onFile: (file: File) => void;
  isProcessing: boolean;
}

export function PhotoUploader({ onFile, isProcessing }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex w-full max-w-md flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
        isDragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Upload a straight-on photo of the card&apos;s front, shot in even lighting against a plain background.
      </p>
      <button
        type="button"
        disabled={isProcessing}
        onClick={() => inputRef.current?.click()}
        className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {isProcessing ? "Processing…" : "Choose or take a photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-zinc-400">or drag and drop an image file here</p>
    </div>
  );
}
