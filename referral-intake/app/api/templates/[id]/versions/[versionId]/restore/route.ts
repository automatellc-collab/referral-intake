import { NextRequest, NextResponse } from "next/server";
import { templateService } from "@/lib/services/template-service";

interface RouteParams {
  id: string;
  versionId: string;
}

/**
 * POST /api/templates/[id]/versions/[versionId]/restore
 * Restore a specific version of a template
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { id, versionId } = await params;

    if (!id || !versionId) {
      return NextResponse.json(
        { success: false, error: "Template ID and version ID are required" },
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

    // Restore the version
    const restored = await templateService.restoreVersion(id, versionId);

    return NextResponse.json({ success: true, data: restored }, { status: 200 });
  } catch (error) {
    console.error("Failed to restore template version:", error);

    // Check if the error is about version not found
    if (error instanceof Error && error.message.includes("Version not found")) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to restore template version" },
      { status: 500 }
    );
  }
}
