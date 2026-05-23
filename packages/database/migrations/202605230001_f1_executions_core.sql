-- F1-DB-001: Durable executions, steps, checkpoints, and checkpoint writes.
-- PostgreSQL is the system of record. Redis/BullMQ are coordination only.

CREATE TABLE IF NOT EXISTS "executions" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "agent_version_id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "version" INT NOT NULL DEFAULT 0,
  "input_json" JSONB NOT NULL,
  "output_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "attempt_count" INT NOT NULL DEFAULT 0,
  "reclaim_count" INT NOT NULL DEFAULT 0,
  "lease_owner" TEXT,
  "lease_expires_at" TIMESTAMPTZ,
  "cancellation_requested_at" TIMESTAMPTZ,
  "budget_snapshot_json" JSONB NOT NULL,
  "context_snapshot_json" JSONB NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "agent_version_id" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "state" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "version" INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "input_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "output_json" JSONB;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "error_code" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "attempt_count" INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "reclaim_count" INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "lease_owner" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "cancellation_requested_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "budget_snapshot_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "context_snapshot_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "created_by" TEXT NOT NULL DEFAULT 'system';
--> statement-breakpoint
UPDATE "executions" SET "tenant_id" = 'legacy' WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "executions" SET "agent_version_id" = 'legacy' WHERE "agent_version_id" IS NULL;
--> statement-breakpoint
UPDATE "executions" SET "state" = upper(COALESCE("status"::text, 'pending')) WHERE "state" IS NULL;
--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "agent_version_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "state" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_steps" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_index" INT NOT NULL,
  "step_type" TEXT NOT NULL,
  "state_from" TEXT,
  "state_to" TEXT,
  "status" TEXT NOT NULL,
  "input_json" JSONB,
  "output_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ended_at" TIMESTAMPTZ,
  UNIQUE ("execution_id", "step_index")
);
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "state_from" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "state_to" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "input_json" JSONB;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "output_json" JSONB;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "error_code" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMPTZ;
--> statement-breakpoint
UPDATE "execution_steps" s SET "tenant_id" = e."tenant_id" FROM "executions" e WHERE s."execution_id" = e."id" AND s."tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "execution_steps" SET "tenant_id" = 'legacy' WHERE "tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'QUEUED';
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'RUNNING';
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'FAILED';
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_checkpoints" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_index" INT NOT NULL,
  "source" TEXT NOT NULL,
  "parent_checkpoint_id" TEXT REFERENCES "execution_checkpoints"("id"),
  "state_json" JSONB NOT NULL,
  "channel_versions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "versions_seen" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'runtime';
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "parent_checkpoint_id" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "state_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "channel_versions" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "versions_seen" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
UPDATE "execution_checkpoints" c SET "tenant_id" = e."tenant_id" FROM "executions" e WHERE c."execution_id" = e."id" AND c."tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "execution_checkpoints" SET "tenant_id" = 'legacy' WHERE "tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "execution_checkpoints"
    ADD CONSTRAINT "execution_checkpoints_parent_fk"
    FOREIGN KEY ("parent_checkpoint_id") REFERENCES "execution_checkpoints"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_checkpoint_writes" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "checkpoint_id" TEXT NOT NULL REFERENCES "execution_checkpoints"("id") ON DELETE CASCADE,
  "task_id" TEXT NOT NULL,
  "task_path" TEXT NOT NULL DEFAULT '',
  "write_index" INT NOT NULL,
  "channel" TEXT NOT NULL,
  "type" TEXT,
  "value_json" JSONB NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_tenant_state_created" ON "executions" ("tenant_id", "state", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_lease_stale" ON "executions" ("state", "lease_expires_at") WHERE state IN ('RUNNING', 'RECLAIMING', 'DISPATCHED');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_steps_execution_step_index" ON "execution_steps" ("execution_id", "step_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_steps_tenant_execution" ON "execution_steps" ("tenant_id", "execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoints_execution_step_index" ON "execution_checkpoints" ("execution_id", "step_index" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoints_tenant_execution_step" ON "execution_checkpoints" ("tenant_id", "execution_id", "step_index" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_checkpoints_execution_step_unique" ON "execution_checkpoints" ("execution_id", "step_index");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_checkpoints_execution_step_source" ON "execution_checkpoints" ("execution_id", "step_index", "source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoint_writes_tenant_checkpoint_write" ON "execution_checkpoint_writes" ("tenant_id", "checkpoint_id", "write_index");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoints_parent" ON "execution_checkpoints" ("parent_checkpoint_id") WHERE parent_checkpoint_id IS NOT NULL;
