-- Canonicalize F1 execution FSM storage on executions.status.
-- executions.state remains temporarily as a lowercase alias for legacy readers only.
--
-- Fresh environments can still hit this migration after the legacy enum expansion
-- migration. Rebuilding the enum here avoids relying on ALTER TYPE ADD VALUE
-- commits from an earlier migration before the canonical status rewrite runs.

ALTER TABLE "executions" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "public"."execution_status" RENAME TO "execution_status_legacy";
--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM (
  'pending',
  'queued',
  'dispatched',
  'running',
  'waiting_tool',
  'waiting_human',
  'retrying',
  'retry_scheduled',
  'suspended',
  'reclaimable',
  'completed',
  'failed',
  'cancelled'
);
--> statement-breakpoint
ALTER TABLE "executions"
ALTER COLUMN "status" TYPE "public"."execution_status"
USING (
  CASE UPPER(COALESCE("state", "status"::text))
    WHEN 'PENDING' THEN 'pending'
    WHEN 'QUEUED' THEN 'queued'
    WHEN 'DISPATCHED' THEN 'dispatched'
    WHEN 'RUNNING' THEN 'running'
    WHEN 'PAUSED' THEN 'suspended'
    WHEN 'SUSPENDED' THEN 'suspended'
    WHEN 'AWAITING_APPROVAL' THEN 'waiting_human'
    WHEN 'WAITING_HUMAN' THEN 'waiting_human'
    WHEN 'WAITING_TOOL' THEN 'waiting_tool'
    WHEN 'RETRYING' THEN 'retrying'
    WHEN 'RETRY_SCHEDULED' THEN 'retry_scheduled'
    WHEN 'RECLAIMING' THEN 'reclaimable'
    WHEN 'RECLAIMABLE' THEN 'reclaimable'
    WHEN 'TIMED_OUT' THEN 'failed'
    WHEN 'SUCCEEDED' THEN 'completed'
    WHEN 'COMPLETED' THEN 'completed'
    WHEN 'FAILED' THEN 'failed'
    WHEN 'CANCELLED' THEN 'cancelled'
    WHEN 'DLQ' THEN 'failed'
    ELSE COALESCE("status"::text, 'pending')
  END
)::"public"."execution_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."execution_status_legacy";
--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
UPDATE "executions" SET "state" = "status"::text;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_executions_lease_stale";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_lease_stale" ON "executions" ("status", "lease_expires_at") WHERE status IN ('running', 'reclaimable', 'dispatched');
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_executions_tenant_state_created";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_tenant_state_created" ON "executions" ("tenant_id", "status", "created_at" DESC);
