import "server-only";

import { db } from "@/lib/db/client";
import { templates, templateVersions } from "@/lib/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";

export interface TemplateConfig {
  fieldOrder: string[];
  fieldVisibility: Record<string, boolean>;
  fieldRenames: Record<string, string>;
  fieldPrompts?: Record<string, string>;
  outputFormatSettings?: {
    narrative?: Record<string, unknown>;
    structured?: Record<string, unknown>;
    checklist?: Record<string, unknown>;
  };
}

export interface Template {
  id: string;
  name: string;
  specialty: string | null;
  description?: string;
  createdBy: string;
  ownedBy: string;
  scope: "personal" | "team" | "organization" | "public";
  currentVersionId: string | null;
  config: TemplateConfig;
  isActive: boolean;
  defaultOutputFormat: "narrative" | "structured" | "checklist";
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  config: TemplateConfig;
  changelog?: string;
  createdBy: string;
  createdAt: Date;
}

export class TemplateService {
  async createTemplate(
    name: string,
    specialty: string | null,
    createdBy: string,
    config?: TemplateConfig,
    scope: "personal" | "team" | "organization" | "public" = "personal"
  ): Promise<Template> {
    const defaultConfig: TemplateConfig = config || {
      fieldOrder: [],
      fieldVisibility: {},
      fieldRenames: {},
    };

    const result = await db
      .insert(templates)
      .values({
        name,
        specialty,
        createdBy,
        ownedBy: createdBy,
        scope,
        config: defaultConfig,
        isActive: true,
        defaultOutputFormat: "narrative",
      })
      .returning();

    if (!result[0]) {
      throw new Error("Failed to create template");
    }

    return this.formatTemplate(result[0]);
  }

  async getTemplate(id: string): Promise<Template | null> {
    const result = await db.query.templates.findFirst({
      where: eq(templates.id, id),
    });

    return result ? this.formatTemplate(result) : null;
  }

  async listTemplates(filters: {
    specialty?: string;
    scope?: string;
    createdBy?: string;
    ownedBy?: string;
  }): Promise<Template[]> {
    let query = db.query.templates.findMany();

    const conditions = [];

    if (filters.specialty) {
      conditions.push(eq(templates.specialty, filters.specialty));
    }
    if (filters.scope) {
      conditions.push(eq(templates.scope, filters.scope as any));
    }
    if (filters.createdBy) {
      conditions.push(eq(templates.createdBy, filters.createdBy));
    }
    if (filters.ownedBy) {
      conditions.push(eq(templates.ownedBy, filters.ownedBy));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query;
    return results.map((t) => this.formatTemplate(t));
  }

  async updateTemplateConfig(
    id: string,
    config: TemplateConfig,
    changelog?: string
  ): Promise<Template> {
    // Get current template
    const currentTemplate = await this.getTemplate(id);
    if (!currentTemplate) {
      throw new Error("Template not found");
    }

    // Get current version number
    const latestVersion = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.templateId, id),
      orderBy: (v) => [v.version],
    });

    const nextVersion = (latestVersion?.version ?? 0) + 1;

    // Create new version
    const versionResult = await db
      .insert(templateVersions)
      .values({
        templateId: id,
        version: nextVersion,
        config,
        changelog,
        createdBy: currentTemplate.ownedBy,
      })
      .returning();

    if (!versionResult[0]) {
      throw new Error("Failed to create template version");
    }

    // Update template
    const updated = await db
      .update(templates)
      .set({
        config,
        currentVersionId: versionResult[0].id,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, id))
      .returning();

    if (!updated[0]) {
      throw new Error("Failed to update template");
    }

    return this.formatTemplate(updated[0]);
  }

  async getTemplateVersions(templateId: string): Promise<TemplateVersion[]> {
    const results = await db.query.templateVersions.findMany({
      where: eq(templateVersions.templateId, templateId),
      orderBy: (v) => [v.version],
    });

    return results.map((v) => ({
      id: v.id,
      templateId: v.templateId,
      version: v.version,
      config: v.config as TemplateConfig,
      changelog: v.changelog ?? undefined,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
    }));
  }

  async restoreVersion(templateId: string, versionId: string): Promise<Template> {
    const version = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.id, versionId),
    });

    if (!version) {
      throw new Error("Version not found");
    }

    // Create new version with restored config
    const restored = await db
      .insert(templateVersions)
      .values({
        templateId,
        version: (version.version ?? 0) + 1,
        config: version.config as TemplateConfig,
        changelog: `Restored from version ${version.version}`,
        createdBy: version.createdBy,
      })
      .returning();

    if (!restored[0]) {
      throw new Error("Failed to restore version");
    }

    // Update template
    const updated = await db
      .update(templates)
      .set({
        config: version.config as TemplateConfig,
        currentVersionId: restored[0].id,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, templateId))
      .returning();

    if (!updated[0]) {
      throw new Error("Failed to update template");
    }

    return this.formatTemplate(updated[0]);
  }

  async deleteTemplate(id: string, soft = true): Promise<void> {
    if (soft) {
      await db
        .update(templates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(templates.id, id));
    } else {
      await db.delete(templates).where(eq(templates.id, id));
    }
  }

  async getDefaultTemplate(specialty: string): Promise<Template | null> {
    const result = await db.query.templates.findFirst({
      where: and(
        eq(templates.specialty, specialty),
        eq(templates.scope, "organization"),
        eq(templates.isActive, true)
      ),
    });

    return result ? this.formatTemplate(result) : null;
  }

  private formatTemplate(t: any): Template {
    return {
      id: t.id,
      name: t.name,
      specialty: t.specialty,
      description: t.description,
      createdBy: t.createdBy,
      ownedBy: t.ownedBy,
      scope: t.scope,
      currentVersionId: t.currentVersionId,
      config: (t.config as TemplateConfig) || {
        fieldOrder: [],
        fieldVisibility: {},
        fieldRenames: {},
      },
      isActive: t.isActive,
      defaultOutputFormat: t.defaultOutputFormat,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}

export const templateService = new TemplateService();
