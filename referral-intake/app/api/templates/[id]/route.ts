import { NextRequest, NextResponse } from "next/server";
import { templateService, type TemplateConfig } from "@/lib/services/template-service";

interface RouteParams {
  id: string;
}

/**
 * GET /api/templates/:id
 * Get a specific template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { id } = await params;
    const template = await templateService.getTemplate(id);

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error("Failed to get template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get template" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/templates/:id
 * Update a template config
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { config, changelog } = body;

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Config is required" },
        { status: 400 }
      );
    }

    const template = await templateService.updateTemplateConfig(
      id,
      config as TemplateConfig,
      changelog
    );

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error("Failed to update template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update template" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/:id
 * Delete (soft delete) a template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { id } = await params;
    await templateService.deleteTemplate(id, true); // soft delete

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
