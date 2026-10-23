"use client";

import { useCallback, useMemo, useState } from "react";
import { computeCentering } from "@/lib/centering";
import { getChecklistScore } from "@/lib/checklist";
import { computeOverallGrade } from "@/lib/grade";
import { compressImage, cropCanvas, drawRotated, getImageData, loadImageFromFile } from "@/lib/imageUtils";
import { detectCornerWear, detectEdgeWear, detectSurfaceIrregularity } from "@/lib/subscores";
import { sendTelemetry } from "@/lib/telemetry";
import type {
  AiSurfaceOverride,
  BorderLines,
  CenteringResult,
  GradeResult,
  HeuristicSubscoreResult,
  Rect,
  Subscores,
} from "@/lib/types";

export type WizardStep = "upload" | "straighten" | "crop" | "calibrate" | "review" | "results";
export type HeuristicFactor = "corners" | "edges" | "surface";

function defaultCropRect(canvas: HTMLCanvasElement): Rect {
  return {
    x: canvas.width * 0.05,
    y: canvas.height * 0.05,
    width: canvas.width * 0.9,
    height: canvas.height * 0.9,
  };
}

function defaultBorderLines(canvas: HTMLCanvasElement): BorderLines {
  return {
    top: canvas.height * 0.12,
    bottom: canvas.height * 0.88,
    left: canvas.width * 0.08,
    right: canvas.width * 0.92,
    cardWidth: canvas.width,
    cardHeight: canvas.height,
  };
}

export function useGradingWizard() {
  const [step, setStep] = useState<WizardStep>("upload");
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [rotatedCanvas, setRotatedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [borderLines, setBorderLines] = useState<BorderLines | null>(null);
  const [heuristics, setHeuristics] = useState<Record<HeuristicFactor, HeuristicSubscoreResult> | null>(null);
  const [centering, setCentering] = useState<CenteringResult | null>(null);
  const [manualOverrides, setManualOverrides] = useState<Partial<Record<HeuristicFactor, string>>>({});
  const [aiSurfaceOverride, setAiSurfaceOverrideState] = useState<AiSurfaceOverride | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setIsProcessing(true);
    try {
      const compressed = await compressImage(file);
      const image = await loadImageFromFile(compressed);
      setSourceImage(image);
      setRotation(0);
      const canvas = drawRotated(image, 0);
      setRotatedCanvas(canvas);
      setCropRect(defaultCropRect(canvas));
      setStep("straighten");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load that image.");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const updateRotation = useCallback(
    (degrees: number) => {
      if (!sourceImage) return;
      setRotation(degrees);
      const canvas = drawRotated(sourceImage, degrees);
      setRotatedCanvas(canvas);
      setCropRect(defaultCropRect(canvas));
    },
    [sourceImage],
  );

  const confirmStraighten = useCallback(() => setStep("crop"), []);

  const updateCropRect = useCallback((rect: Rect) => setCropRect(rect), []);

  const confirmCrop = useCallback(() => {
    if (!rotatedCanvas || !cropRect) return;
    const cropped = cropCanvas(rotatedCanvas, cropRect);
    setCroppedCanvas(cropped);
    setBorderLines(defaultBorderLines(cropped));
    setStep("calibrate");
  }, [rotatedCanvas, cropRect]);

  const updateBorderLines = useCallback((lines: BorderLines) => setBorderLines(lines), []);

  const confirmCalibration = useCallback(() => {
    if (!croppedCanvas || !borderLines) return;
    const imageData = getImageData(croppedCanvas);
    setHeuristics({
      corners: detectCornerWear(imageData, borderLines),
      edges: detectEdgeWear(imageData, borderLines),
      surface: detectSurfaceIrregularity(imageData, borderLines),
    });
    setCentering(computeCentering(borderLines));
    setStep("review");
  }, [croppedCanvas, borderLines]);

  const setOverride = useCallback((factor: HeuristicFactor, optionId: string | null) => {
    if (factor === "surface") {
      setAiSurfaceOverrideState(null);
    }
    setManualOverrides((prev) => {
      const next = { ...prev };
      if (optionId === null) {
        delete next[factor];
      } else {
        next[factor] = optionId;
      }
      return next;
    });
  }, []);

  const applyAiSurfaceOverride = useCallback((score: number, note: string) => {
    setManualOverrides((prev) => {
      const next = { ...prev };
      delete next.surface;
      return next;
    });
    setAiSurfaceOverrideState({ score, note });
    sendTelemetry({ type: "ai_surface_override_applied", score });
  }, []);

  const clearAiSurfaceOverride = useCallback(() => setAiSurfaceOverrideState(null), []);

  const subscores: Subscores | null = useMemo(() => {
    if (!centering || !heuristics) return null;

    const buildFactor = (factor: HeuristicFactor): Subscores[HeuristicFactor] => {
      if (factor === "surface" && aiSurfaceOverride) {
        return { value: aiSurfaceOverride.score, source: "ai", flags: heuristics.surface.flags };
      }
      const manualId = manualOverrides[factor];
      if (manualId) {
        return { value: getChecklistScore(factor, manualId), source: "manual", flags: heuristics[factor].flags };
      }
      return { value: heuristics[factor].subscore, source: "heuristic", flags: heuristics[factor].flags };
    };

    return {
      centering: { value: centering.subscore, source: "heuristic", flags: [] },
      corners: buildFactor("corners"),
      edges: buildFactor("edges"),
      surface: buildFactor("surface"),
    };
  }, [centering, heuristics, manualOverrides, aiSurfaceOverride]);

  const gradeResult: GradeResult | null = useMemo(
    () => (subscores ? computeOverallGrade(subscores) : null),
    [subscores],
  );

  const confirmReview = useCallback(() => {
    if (subscores && heuristics) {
      sendTelemetry({
        type: "grade_completed",
        factors: (["corners", "edges", "surface"] as const).map((factor) => ({
          factor,
          heuristicSeverity: heuristics[factor].worstSeverity,
          heuristicValue: heuristics[factor].subscore,
          overridden: subscores[factor].source !== "heuristic",
          overrideSource: subscores[factor].source === "heuristic" ? undefined : subscores[factor].source,
        })),
      });
    }
    setStep("results");
  }, [subscores, heuristics]);

  const reset = useCallback(() => {
    setStep("upload");
    setSourceImage(null);
    setRotation(0);
    setRotatedCanvas(null);
    setCropRect(null);
    setCroppedCanvas(null);
    setBorderLines(null);
    setHeuristics(null);
    setCentering(null);
    setManualOverrides({});
    setAiSurfaceOverrideState(null);
    setError(null);
  }, []);

  return {
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
    clearAiSurfaceOverride,
    confirmReview,
    reset,
  };
}
