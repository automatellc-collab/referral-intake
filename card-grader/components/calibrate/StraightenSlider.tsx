"use client";

interface StraightenSliderProps {
  previewDataUrl: string;
  rotation: number;
  onRotationChange: (degrees: number) => void;
  onConfirm: () => void;
}

export function StraightenSlider({
  previewDataUrl,
  rotation,
  onRotationChange,
  onConfirm,
}: StraightenSliderProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewDataUrl}
        alt="Straighten preview"
        className="max-h-[55vh] rounded-lg border border-zinc-200 dark:border-zinc-800"
      />
      <div className="w-full max-w-sm">
        <label className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>Straighten</span>
          <span>{rotation.toFixed(1)}°</span>
        </label>
        <input
          type="range"
          min={-20}
          max={20}
          step={0.1}
          value={rotation}
          onChange={(e) => onRotationChange(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Looks straight — continue
      </button>
    </div>
  );
}
