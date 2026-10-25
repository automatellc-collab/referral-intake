import { NextRequest, NextResponse } from "next/server";
import { templateService } from "@/lib/services/template-service";
import { sampleService } from "@/lib/services/sample-service";
import { templateOrchestrator } from "@/lib/template-orchestrator";
import type { NoteSummary } from "@/lib/schema";

interface RouteParams {
  id: string;
  sampleId: string;
}

interface TestRequest {
  extractionResult: NoteSummary;
}

/**
 * Calculate similarity between two values (simple string comparison)
 */
function calculateFieldSimilarity(expected: unknown, actual: unknown): number {
  // Handle null/undefined cases
  if (expected === null || expected === undefined) {
    return actual === null || actual === undefined ? 1.0 : 0.0;
  }
  if (actual === null || actual === undefined) {
    return 0.0;
  }

  // String comparison
  if (typeof expected === "string" && typeof actual === "string") {
    const expLower = expected.toLowerCase().trim();
    const actLower = actual.toLowerCase().trim();
    if (expLower === actLower) {
      return 1.0;
    }
    // Partial credit for substring match
    if (expLower.includes(actLower) || actLower.includes(expLower)) {
      return 0.7;
    }
    return 0.0;
  }

  // Number comparison
  if (typeof expected === "number" && typeof actual === "number") {
    return expected === actual ? 1.0 : 0.0;
  }

  // Boolean comparison
  if (typeof expected === "boolean" && typeof actual === "boolean") {
    return expected === actual ? 1.0 : 0.0;
  }

  // Array comparison
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length === 0 && actual.length === 0) {
      return 1.0;
    }
    if (expected.length === 0 || actual.length === 0) {
      return 0.0;
    }

    let matchCount = 0;
    const compared = new Set<number>();

    // Try to match items from expected to actual
    for (const expItem of expected) {
      let bestMatch = 0;
      let bestIndex = -1;

      for (let i = 0; i < actual.length; i++) {
        if (compared.has(i)) continue;
        const similarity = calculateFieldSimilarity(expItem, actual[i]);
        if (similarity > bestMatch) {
          bestMatch = similarity;
          bestIndex = i;
        }
      }

      if (bestMatch > 0.5) {
        matchCount += bestMatch;
        if (bestIndex >= 0) {
          compared.add(bestIndex);
        }
      }
    }

    return matchCount / expected.length;
  }

  // Object comparison (recursive)
  if (
    typeof expected === "object" &&
    typeof actual === "object" &&
    expected !== null &&
    actual !== null
  ) {
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    const expectedKeys = Object.keys(expectedObj);

    if (expectedKeys.length === 0) {
      return Object.keys(actualObj).length === 0 ? 1.0 : 0.5;
    }

    let totalScore = 0;
    for (const key of expectedKeys) {
      const expValue = expectedObj[key];
      const actValue = actualObj[key];
      totalScore += calculateFieldSimilarity(expValue, actValue);
    }

    return totalScore / expectedKeys.length;
  }

  return 0.0;
}

/**
 * Validate extraction result matches expected output
 */
function validateExtractionResult(
  expected: NoteSummary,
  actual: NoteSummary
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for missing or significantly different fields
  if (!actual.openingNarrative?.value && expected.openingNarrative?.value) {
    issues.push("Opening narrative is missing");
  }

  if (
    (!actual.activeProblems || actual.activeProblems.length === 0) &&
    expected.activeProblems &&
    expected.activeProblems.length > 0
  ) {
    issues.push("Active problems are missing");
  }

  if (
    (!actual.currentMedications?.items ||
      actual.currentMedications.items.length === 0) &&
    expected.currentMedications?.items &&
    expected.currentMedications.items.length > 0
  ) {
    issues.push("Current medications are missing");
  }

  if (
    (!actual.allergies?.items || actual.allergies.items.length === 0) &&
    expected.allergies?.items &&
    expected.allergies.items.length > 0
  ) {
    issues.push("Allergies are missing");
  }

  if (
    (!actual.redFlags || actual.redFlags.length === 0) &&
    expected.redFlags &&
    expected.redFlags.length > 0
  ) {
    issues.push("Red flags are missing");
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * POST /api/templates/[id]/samples/[sampleId]/test
 * Run test against a sample and calculate match score
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { id, sampleId } = await params;

    if (!id || !sampleId) {
      return NextResponse.json(
        { success: false, error: "Template ID and sample ID are required" },
        { status: 400 }
      );
    }

    // Verify template exists
    const template = await templateService.getTemplate(id);
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      );
    }

    // Verify sample exists and belongs to template
    const sample = await sampleService.getSample(sampleId);
    if (!sample) {
      return NextResponse.json(
        { success: false, error: "Sample not found" },
        { status: 404 }
      );
    }

    if (sample.templateId !== id) {
      return NextResponse.json(
        { success: false, error: "Sample does not belong to this template" },
        { status: 403 }
      );
    }

    if (!sample.expectedOutput) {
      return NextResponse.json(
        {
          success: false,
          error: "Sample does not have expected output configured",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as TestRequest;
    const { extractionResult } = body;

    if (!extractionResult) {
      return NextResponse.json(
        { success: false, error: "extractionResult is required" },
        { status: 400 }
      );
    }

    // Apply template to the extraction result
    const { renamed: templatedResult } = templateOrchestrator.applyTemplate(
      extractionResult,
      template.config
    );

    // Calculate match score
    const matchScore = calculateFieldSimilarity(
      sample.expectedOutput,
      templatedResult
    );

    // Validate results
    const { isValid, issues } = validateExtractionResult(
      sample.expectedOutput,
      templatedResult
    );

    // Store test result
    const updatedSample = await sampleService.updateTestResult(
      sampleId,
      isValid,
      matchScore,
      issues
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          sample: updatedSample,
          testResult: {
            matchScore,
            isValid,
            issues,
            templatedResult,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to run sample test:", error);
    return NextResponse.json(
      { success: false, error: "Failed to run sample test" },
      { status: 500 }
    );
  }
}
