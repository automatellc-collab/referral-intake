import { NextRequest, NextResponse } from "next/server";
import { templateService } from "@/lib/services/template-service";
import { sampleService } from "@/lib/services/sample-service";
import type { NoteSummary } from "@/lib/schema";

interface RouteParams {
  id: string;
}

/**
 * GET /api/templates/[id]/samples
 * List all samples for a template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
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

    // Get all samples
    const samples = await sampleService.listSamples(id);

    return NextResponse.json({ success: true, data: samples });
  } catch (error) {
    console.error("Failed to list samples:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list samples" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates/[id]/samples
 * Create a new sample for a template
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
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

    const body = await request.json();
    const {
      name,
      referralText,
      expectedOutput,
      uploadedAttachmentUrls = [],
    } = body;

    if (!name || !referralText) {
      return NextResponse.json(
        { success: false, error: "Sample name and referralText are required" },
        { status: 400 }
      );
    }

    // In a real app, get user from auth session
    const createdBy = "user-123"; // TODO: Get from auth

    const sample = await sampleService.createSample(
      id,
      name,
      referralText,
      expectedOutput as NoteSummary | undefined,
      uploadedAttachmentUrls,
      createdBy
    );

    return NextResponse.json({ success: true, data: sample }, { status: 201 });
  } catch (error) {
    console.error("Failed to create sample:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create sample" },
      { status: 500 }
    );
  }
}
