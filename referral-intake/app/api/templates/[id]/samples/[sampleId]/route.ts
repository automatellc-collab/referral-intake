import { NextRequest, NextResponse } from "next/server";
import { templateService } from "@/lib/services/template-service";
import { sampleService } from "@/lib/services/sample-service";
import type { NoteSummary } from "@/lib/schema";

interface RouteParams {
  id: string;
  sampleId: string;
}

/**
 * GET /api/templates/[id]/samples/[sampleId]
 * Get a specific sample
 */
export async function GET(
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

    // Get the sample
    const sample = await sampleService.getSample(sampleId);
    if (!sample) {
      return NextResponse.json(
        { success: false, error: "Sample not found" },
        { status: 404 }
      );
    }

    // Verify sample belongs to template
    if (sample.templateId !== id) {
      return NextResponse.json(
        { success: false, error: "Sample does not belong to this template" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: sample });
  } catch (error) {
    console.error("Failed to get sample:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get sample" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/templates/[id]/samples/[sampleId]
 * Update a sample's expected output
 */
export async function PUT(
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

    const body = await request.json();
    const { expectedOutput } = body;

    if (!expectedOutput) {
      return NextResponse.json(
        { success: false, error: "expectedOutput is required" },
        { status: 400 }
      );
    }

    const updated = await sampleService.updateSampleExpectedOutput(
      sampleId,
      expectedOutput as NoteSummary
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Failed to update sample:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update sample" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[id]/samples/[sampleId]
 * Delete a sample
 */
export async function DELETE(
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

    await sampleService.deleteSample(sampleId);

    return NextResponse.json(
      { success: true, data: { id: sampleId } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to delete sample:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete sample" },
      { status: 500 }
    );
  }
}
