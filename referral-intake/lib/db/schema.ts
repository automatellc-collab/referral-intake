import {
  pgTable,
  text,
  timestamp,
  numeric,
  jsonb,
  boolean,
  serial,
  varchar,
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
