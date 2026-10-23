"use client";

import { useMemo } from "react";
import { BorderLineCalibrator } from "@/components/calibrate/BorderLineCalibrator";
import { CardCropper } from "@/components/calibrate/CardCropper";
import { StraightenSlider } from "@/components/calibrate/StraightenSlider";
import { FlagBadge } from "@/components/results/FlagBadge";
import { GradeSummary } from "@/components/results/GradeSummary";
import { ManualOverridePanel } from "@/components/results/ManualOverridePanel";
import { MarketValueEstimate } from "@/components/results/MarketValueEstimate";
import { SubscoreBar } from "@/components/results/SubscoreBar";
import { PhotoUploader } from "@/components/upload/PhotoUploader";
import { useGradingWizard, type HeuristicFactor } from "@/hooks/useGradingWizard";
import { formatRatio } from "@/lib/centering";
import { canvasToBase64Jpeg, canvasToDataUrl } from "@/lib/imageUtils";
import type { GradeFactorId } from "@/lib/types";

const FACTOR_LABELS: Record<GradeFactorId, string> = {
  centering: "Centering",
  corners: "Corners",
  edges: "Edges",
  surface: "Surface",
};

const AUTO_SCORED_FACTORS: HeuristicFactor[] = ["corners", "edges"];

export default function GradePage() {
  const {
    step,
    rotation,
    rotatedCanvas,
    cropRect,
    croppedCanvas,
    borderLines,
    centering,
    heuristics,
    manualOverrides,
    aiSurfaceOverride,
    subscores,
    gradeResult,
    error,
    isProcessing,
    loadFile,
    updateRotation,
    confirmStraighten,
    updateCropRect,
    confirmCrop,
    updateBorderLines,
    confirmCalibration,
    setOverride,
    applyAiSurfaceOverride,
    confirmReview,
    reset,
  } = useGradingWizard();

  const rotatedPreviewUrl = useMemo(
    () => (rotatedCanvas ? canvasToDataUrl(rotatedCanvas) : null),
    [rotatedCanvas],
  );

  return (
    <div className="flex flex-1 flex-col items-center gap-10 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Grade estimator</h1>

      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
          {error}
        </p>
      )}

      {step === "upload" && <PhotoUploader onFile={loadFile} isProcessing={isProcessing} />}

      {step === "straighten" && rotatedPreviewUrl && (
        <StraightenSlider
          previewDataUrl={rotatedPreviewUrl}
          rotation={rotation}
          onRotationChange={updateRotation}
          onConfirm={confirmStraighten}
        />
      )}

      {step === "crop" && rotatedCanvas && cropRect && (
        <CardCropper
          canvas={rotatedCanvas}
          cropRect={cropRect}
          onChange={updateCropRect}
          onConfirm={confirmCrop}
        />
      )}

      {step === "calibrate" && croppedCanvas && borderLines && (
        <BorderLineCalibrator
          canvas={croppedCanvas}
          lines={borderLines}
          onChange={updateBorderLines}
          onConfirm={confirmCalibration}
        />
      )}

      {step === "review" && subscores && heuristics && centering && (
        <div className="flex w-full max-w-md flex-col gap-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Review the automated estimates below. If you can see corner, edge, or surface wear more
            clearly yourself, rate it manually — your rating takes priority.
          </p>

          <div className="flex flex-col gap-1">
            <SubscoreBar label="Centering" value={subscores.centering.value} sourceLabel="measured" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Horizontal {formatRatio(centering.horizontal.nearSidePct, centering.horizontal.farSidePct)} ·
              Vertical {formatRatio(centering.vertical.nearSidePct, centering.vertical.farSidePct)}
            </p>
          </div>

          {AUTO_SCORED_FACTORS.map((factor) => (
            <div key={factor} className="flex flex-col gap-3">
              <SubscoreBar
                label={FACTOR_LABELS[factor]}
                value={subscores[factor].value}
                sourceLabel={
                  subscores[factor].source === "manual" ? "your rating" : "low confidence estimate"
                }
              />
              <div className="flex flex-wrap gap-1.5">
                {heuristics[factor].flags.map((flag) => (
                  <FlagBadge key={flag.region} flag={flag} />
                ))}
              </div>
              <ManualOverridePanel
                factor={factor}
                label={FACTOR_LABELS[factor].toLowerCase()}
                selectedOptionId={manualOverrides[factor]}
                onSelect={(optionId) => setOverride(factor, optionId)}
              />
            </div>
          ))}

          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                Surface — needs your eyes
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-400/80">
                Our automated scan can&apos;t reliably tell card art or print texture from real scratches,
                so Surface doesn&apos;t count toward your grade until you confirm what you see below.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {heuristics.surface.flags.map((flag) => (
                <FlagBadge key={flag.region} flag={flag} />
              ))}
            </div>
            <ManualOverridePanel
              factor="surface"
              label="surface"
              selectedOptionId={manualOverrides.surface}
              hasActiveOverride={Boolean(manualOverrides.surface) || Boolean(aiSurfaceOverride)}
              onSelect={(optionId) => setOverride("surface", optionId)}
            />
          </div>

          <button
            type="button"
            onClick={confirmReview}
            className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            See estimated grade
          </button>
        </div>
      )}

      {step === "results" && gradeResult && subscores && (
        <div className="flex w-full max-w-md flex-col gap-6">
          <GradeSummary grade={gradeResult} />
          <div className="flex flex-col gap-3">
            {(["centering", "corners", "edges"] as const).map((factor) => (
              <SubscoreBar
                key={factor}
                label={FACTOR_LABELS[factor]}
                value={subscores[factor].value}
                sourceLabel={subscores[factor].source === "manual" ? "your rating" : undefined}
              />
            ))}
            {subscores.surface.source !== "heuristic" ? (
              <SubscoreBar
                label="Surface"
                value={subscores.surface.value}
                sourceLabel={subscores.surface.source === "ai" ? "AI assessment" : "your rating"}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-amber-300 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:text-amber-300">
                Surface — not confirmed, not counted in this grade
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            This is an educational estimate from a single front photo, not an official grade. Real grading
            services also inspect the back, check authenticity, and use controlled lighting and equipment.
            {gradeResult.surfaceExcluded &&
              " Surface condition wasn't included in this estimate because it couldn't be reliably measured automatically — the grade above reflects centering, corners, and edges only."}
          </p>
          {croppedCanvas && heuristics && (
            <MarketValueEstimate
              getFrontImageBase64={() => canvasToBase64Jpeg(croppedCanvas)}
              grade={{
                overall: gradeResult.overall,
                low: gradeResult.low,
                high: gradeResult.high,
                centering: subscores.centering.value,
                corners: subscores.corners.value,
                edges: subscores.edges.value,
                surfaceHeuristic: heuristics.surface.subscore,
              }}
              onApplySurfaceAssessment={applyAiSurfaceOverride}
            />
          )}
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
          >
            Grade another card
          </button>
        </div>
      )}
    </div>
  );
}
