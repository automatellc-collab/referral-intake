CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" varchar(100) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"specialty" varchar(100) NOT NULL,
	"document_type" varchar(50),
	"model" varchar(50) NOT NULL,
	"extraction_method" varchar(50) NOT NULL,
	"success" boolean NOT NULL,
	"confidence" numeric(3, 2),
	"tokens_used" serial NOT NULL,
	"estimated_cost" numeric(10, 6),
	"latency_ms" serial NOT NULL,
	"error_message" text,
	"retry_count" serial DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_hash" varchar(64) NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"reasoning" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classifications_document_hash_unique" UNIQUE("document_hash")
);
--> statement-breakpoint
CREATE TABLE "extraction_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"specialty" varchar(100) NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"summary" jsonb NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"extraction_method" varchar(50) NOT NULL,
	"requires_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "extraction_cache_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "extraction_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"extraction_id" serial NOT NULL,
	"original_data" jsonb NOT NULL,
	"corrected_data" jsonb NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"feedback_type" varchar(50) NOT NULL,
	"confidence" numeric(3, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_validations" (
	"id" serial PRIMARY KEY NOT NULL,
	"extraction_id" serial NOT NULL,
	"is_valid" boolean NOT NULL,
	"validity_score" numeric(3, 2) NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"model" varchar(50) NOT NULL,
	"specialty" varchar(100) NOT NULL,
	"success_rate" numeric(5, 4) NOT NULL,
	"avg_confidence" numeric(5, 4) NOT NULL,
	"avg_latency_ms" serial NOT NULL,
	"cost_per_extraction" numeric(10, 8) NOT NULL,
	"record_count" serial NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"extraction_id" serial NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'standard' NOT NULL,
	"reason" text NOT NULL,
	"assigned_to" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_feedback" ADD CONSTRAINT "extraction_feedback_extraction_id_extraction_cache_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_validations" ADD CONSTRAINT "medical_validations_extraction_id_extraction_cache_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_extraction_id_extraction_cache_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction_cache"("id") ON DELETE no action ON UPDATE no action;