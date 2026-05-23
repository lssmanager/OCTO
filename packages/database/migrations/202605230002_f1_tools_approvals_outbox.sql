-- F1-DB-002: Agent versions, tool invocations, approvals, and transactional outbox.

CREATE TABLE IF NOT EXISTS "agent_versions" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "version" INT NOT NULL,
  "config_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "agent_id", "version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_versions_tenant_agent" ON "agent_versions" ("tenant_id", "agent_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_invocations" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_id" TEXT NOT NULL REFERENCES "execution_steps"("id") ON DELETE RESTRICT,
  "tool_name" TEXT NOT NULL,
  "tool_kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "args_json" JSONB NOT NULL,
  "result_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  "approval_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "duration_ms" INT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ended_at" TIMESTAMPTZ
);
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "tool_kind" TEXT NOT NULL DEFAULT 'builtin';
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "args_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "result_json" JSONB;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "error_code" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "requires_approval" BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "approval_id" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMPTZ;
--> statement-breakpoint
UPDATE "tool_invocations" t SET "tenant_id" = e."tenant_id" FROM "executions" e WHERE t."execution_id" = e."id" AND t."tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "tool_invocations" SET "tenant_id" = 'legacy' WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "tool_invocations" SET "idempotency_key" = "id" WHERE "idempotency_key" IS NULL;
--> statement-breakpoint
UPDATE "tool_invocations" SET "args_json" = COALESCE("input", '{}'::jsonb) WHERE "args_json" = '{}'::jsonb AND "input" IS NOT NULL;
--> statement-breakpoint
UPDATE "tool_invocations" SET "result_json" = "output" WHERE "result_json" IS NULL AND "output" IS NOT NULL;
--> statement-breakpoint
UPDATE "tool_invocations" SET "started_at" = COALESCE("invoked_at", now()) WHERE "started_at" IS NULL;
--> statement-breakpoint
UPDATE "tool_invocations" SET "ended_at" = "completed_at" WHERE "ended_at" IS NULL AND "completed_at" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ALTER COLUMN "idempotency_key" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'PENDING';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'RUNNING';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'FAILED';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'TIMED_OUT';
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_id" TEXT NOT NULL REFERENCES "execution_steps"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "timeout_at" TIMESTAMPTZ,
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMPTZ,
  "resolution_json" JSONB
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_invocations"
    ADD CONSTRAINT "tool_invocations_approval_fk"
    FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "published_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tool_invocations_idempotency" ON "tool_invocations" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_invocations_tenant_execution" ON "tool_invocations" ("tenant_id", "execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_invocations_tenant_status_started" ON "tool_invocations" ("tenant_id", "status", "started_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_tenant_status_timeout" ON "approvals" ("tenant_id", "status", "timeout_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_tenant_execution" ON "approvals" ("tenant_id", "execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_unpublished" ON "outbox_events" ("published_at", "created_at") WHERE published_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_tenant_aggregate_sequence" ON "outbox_events" ("tenant_id", "aggregate_type", "aggregate_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_outbox_tenant_aggregate_sequence_unique" ON "outbox_events" ("tenant_id", "aggregate_type", "aggregate_id", "sequence");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_execution_status" ON "approvals" ("execution_id", "status");
