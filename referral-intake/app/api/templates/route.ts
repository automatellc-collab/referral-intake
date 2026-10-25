import { NextRequest, NextResponse } from "next/server";
import { templateService } from "@/lib/services/template-service";

/**
 * GET /api/templates
 * List all templates accessible to user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const specialty = searchParams.get("specialty") || undefined;
    const scope = searchParams.get("scope") || undefined;

    const templates = await templateService.listTemplates({
      specialty: specialty,
      scope: scope,
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("Failed to list templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list templates" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates
 * Create a new template
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, specialty, description, scope = "personal" } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Template name is required" },
        { status: 400 }
      );
    }

    // In a real app, get user from auth session
    const createdBy = "user-123"; // TODO: Get from auth

    const template = await templateService.createTemplate(
      name,
      specialty || null,
      createdBy,
      {
        fieldOrder: [],
        fieldVisibility: {},
        fieldRenames: {},
      },
      scope
    );

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error("Failed to create template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 }
    );
  }
}
