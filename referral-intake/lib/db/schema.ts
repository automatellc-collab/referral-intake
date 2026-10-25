import {
  pgTable,
  text,
  timestamp,
  numeric,
  jsonb,
  boolean,
  serial,
  varchar,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";

// Extraction cache
export const extractionCache = pgTable("extraction_cache", {
  id: serial("id").primaryKey(),
  contentHash: varchar("content_hash", { length: 64 }).notNull().unique(),
  specialty: varchar("specialty", { length: 100 }).notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  summary: jsonb("summary").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  extractionMethod: varchar("extraction_method", { length: 50 }).notNull(),
  requiresReview: boolean("requires_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Document classifications
export const classifications = pgTable("classifications", {
  id: serial("id").primaryKey(),
  documentHash: varchar("document_hash", { length: 64 }).notNull().unique(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  reasoning: text("reasoning").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Medical validation results
export const medicalValidations = pgTable("medical_validations", {
  id: serial("id").primaryKey(),
  extractionId: serial("extraction_id").references(() => extractionCache.id),
  isValid: boolean("is_valid").notNull(),
  validityScore: numeric("validity_score", { precision: 3, scale: 2 }).notNull(),
  issues: jsonb("issues").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Review queue
export const reviewQueue = pgTable("review_queue", {
  id: serial("id").primaryKey(),
  extractionId: serial("extraction_id").references(() => extractionCache.id),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, in_review, approved, rejected
  priority: varchar("priority", { length: 20 }).notNull().default("standard"), // critical, urgent, standard
  reason: text("reason").notNull(),
  assignedTo: varchar("assigned_to", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Feedback/corrections from clinicians
export const extractionFeedback = pgTable("extraction_feedback", {
  id: serial("id").primaryKey(),
  extractionId: serial("extraction_id").references(() => extractionCache.id),
  originalData: jsonb("original_data").notNull(),
  correctedData: jsonb("corrected_data").notNull(),
  changedFields: jsonb("changed_fields").notNull(),
  feedbackType: varchar("feedback_type", { length: 50 }).notNull(), // correction, approval, rejection
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Audit log
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  requestId: varchar("request_id", { length: 100 }).notNull().unique(),
  inputHash: varchar("input_hash", { length: 64 }).notNull(),
  specialty: varchar("specialty", { length: 100 }).notNull(),
  documentType: varchar("document_type", { length: 50 }),
  model: varchar("model", { length: 50 }).notNull(),
  extractionMethod: varchar("extraction_method", { length: 50 }).notNull(),
  success: boolean("success").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  tokensUsed: serial("tokens_used"),
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 6 }),
  latencyMs: serial("latency_ms"),
  errorMessage: text("error_message"),
  retryCount: serial("retry_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Model performance metrics
export const modelMetrics = pgTable("model_metrics", {
  id: serial("id").primaryKey(),
  model: varchar("model", { length: 50 }).notNull(),
  speciality: varchar("specialty", { length: 100 }).notNull(),
  successRate: numeric("success_rate", { precision: 5, scale: 4 }).notNull(),
  avgConfidence: numeric("avg_confidence", { precision: 5, scale: 4 }).notNull(),
  avgLatencyMs: serial("avg_latency_ms").notNull(),
  costPerExtraction: numeric("cost_per_extraction", { precision: 10, scale: 8 }).notNull(),
  recordCount: serial("record_count").notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

// Templates for customizing extraction output
export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    specialty: varchar("specialty", { length: 100 }), // null = global template
    description: text("description"),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    ownedBy: varchar("owned_by", { length: 100 }).notNull(),
    scope: varchar("scope", { length: 20 }).notNull().default("personal"), // personal, team, organization, public
    currentVersionId: uuid("current_version_id"),
    config: jsonb("config").notNull().default({}), // fieldOrder, fieldVisibility, fieldRenames, fieldPrompts, outputFormatSettings
    isActive: boolean("is_active").notNull().default(true),
    defaultOutputFormat: varchar("default_output_format", { length: 20 }).notNull().default("narrative"), // narrative, structured, checklist
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    specialtyIdx: index("templates_specialty_idx").on(table.specialty),
    scopeIdx: index("templates_scope_idx").on(table.scope),
    createdByIdx: index("templates_created_by_idx").on(table.createdBy),
  })
);

// Template versions (immutable history)
export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(), // Same structure as templates.config
    changelog: text("changelog"),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    templateIdIdx: index("template_versions_template_id_idx").on(table.templateId),
  })
);

// Sample extractions for testing templates
export const extractionSamples = pgTable(
  "extraction_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    referralText: text("referral_text").notNull(),
    uploadedAttachmentUrls: jsonb("uploaded_attachment_urls").default([]), // array of URLs
    expectedOutput: jsonb("expected_output"), // NoteSummary JSON
    testResultSuccess: boolean("test_result_success"),
    testResultMatchScore: numeric("test_result_match_score", { precision: 3, scale: 2 }),
    testResultIssues: jsonb("test_result_issues").default([]), // array of field mismatch details
    testResultLastTestedAt: timestamp("test_result_last_tested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
  },
  (table) => ({
    templateIdIdx: index("extraction_samples_template_id_idx").on(table.templateId),
  })
);

// Template usage analytics (for Phase 3)
export const templateUsageStats = pgTable(
  "template_usage_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
    dateUsed: timestamp("date_used", { withTimezone: true }).notNull(),
    extractionCount: integer("extraction_count").notNull().default(0),
    avgConfidence: numeric("avg_confidence", { precision: 3, scale: 2 }),
    avgFieldAccuracy: numeric("avg_field_accuracy", { precision: 3, scale: 2 }),
    issues: jsonb("issues").default([]), // array of { fieldId, errorCount, avgScore }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    templateIdIdx: index("template_usage_stats_template_id_idx").on(table.templateId),
  })
);
