import "server-only";

import { db } from "@/lib/db/client";
import { extractionSamples } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { NoteSummary } from "@/lib/schema";

export interface ExtractionSample {
  id: string;
  templateId: string;
  name: string;
  referralText: string;
  uploadedAttachmentUrls: string[];
  expectedOutput?: NoteSummary;
  testResult?: {
    lastTestedAt: Date;
    success: boolean;
    matchScore: number;
    issues: string[];
  };
  createdAt: Date;
  createdBy: string;
}

export class SampleService {
  async createSample(
    templateId: string,
    name: string,
    referralText: string,
    expectedOutput?: NoteSummary,
    attachmentUrls: string[] = [],
    createdBy: string = "system"
  ): Promise<ExtractionSample> {
    const result = await db
      .insert(extractionSamples)
      .values({
        templateId,
        name,
        referralText,
        uploadedAttachmentUrls: attachmentUrls,
        expectedOutput,
        createdBy,
      })
      .returning();

    if (!result[0]) {
      throw new Error("Failed to create sample");
    }

    return this.formatSample(result[0]);
  }

  async getSample(id: string): Promise<ExtractionSample | null> {
    const result = await db.query.extractionSamples.findFirst({
      where: eq(extractionSamples.id, id),
    });

    return result ? this.formatSample(result) : null;
  }

  async listSamples(templateId: string): Promise<ExtractionSample[]> {
    const results = await db.query.extractionSamples.findMany({
      where: eq(extractionSamples.templateId, templateId),
    });

    return results.map((s) => this.formatSample(s));
  }

  async updateSampleExpectedOutput(
    id: string,
    expectedOutput: NoteSummary
  ): Promise<ExtractionSample> {
    const result = await db
      .update(extractionSamples)
      .set({ expectedOutput })
      .where(eq(extractionSamples.id, id))
      .returning();

    if (!result[0]) {
      throw new Error("Sample not found");
    }

    return this.formatSample(result[0]);
  }

  async updateTestResult(
    id: string,
    success: boolean,
    matchScore: number,
    issues: string[] = []
  ): Promise<ExtractionSample> {
    const result = await db
      .update(extractionSamples)
      .set({
        testResultSuccess: success,
        testResultMatchScore: matchScore.toString(),
        testResultIssues: issues,
        testResultLastTestedAt: new Date(),
      })
      .where(eq(extractionSamples.id, id))
      .returning();

    if (!result[0]) {
      throw new Error("Sample not found");
    }

    return this.formatSample(result[0]);
  }

  async deleteSample(id: string): Promise<void> {
    await db.delete(extractionSamples).where(eq(extractionSamples.id, id));
  }

  private formatSample(s: any): ExtractionSample {
    const testResult = s.testResultSuccess !== null ? {
      lastTestedAt: s.testResultLastTestedAt,
      success: s.testResultSuccess,
      matchScore: parseFloat(s.testResultMatchScore || "0"),
      issues: (s.testResultIssues as string[]) || [],
    } : undefined;

    return {
      id: s.id,
      templateId: s.templateId,
      name: s.name,
      referralText: s.referralText,
      uploadedAttachmentUrls: (s.uploadedAttachmentUrls as string[]) || [],
      expectedOutput: s.expectedOutput as NoteSummary | undefined,
      testResult,
      createdAt: s.createdAt,
      createdBy: s.createdBy,
    };
  }
}

export const sampleService = new SampleService();
