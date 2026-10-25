import { NextRequest, NextResponse } from "next/server";
import { templateService } from "@/lib/services/template-service";

interface RouteParams {
  id: string;
}

/**
 * GET /api/templates/[id]/versions
 * List all versions of a template
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

    // Get all versions
    const versions = await templateService.getTemplateVersions(id);

    return NextResponse.json({ success: true, data: versions });
  } catch (error) {
    console.error("Failed to list template versions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list template versions" },
      { status: 500 }
    );
  }
}
