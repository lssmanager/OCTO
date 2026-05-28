-- Canonicalize F1 execution FSM storage on executions.status.
-- executions.state remains temporarily as a lowercase alias for legacy readers only.

UPDATE "executions"
SET "status" = CASE UPPER(COALESCE("state", "status"::text))
  WHEN 'PENDING' THEN 'pending'::execution_status
  WHEN 'QUEUED' THEN 'queued'::execution_status
  WHEN 'DISPATCHED' THEN 'dispatched'::execution_status
  WHEN 'RUNNING' THEN 'running'::execution_status
  WHEN 'PAUSED' THEN 'suspended'::execution_status
  WHEN 'WAITING_TOOL' THEN 'waiting_tool'::execution_status
  WHEN 'WAITING_HUMAN' THEN 'waiting_human'::execution_status
  WHEN 'RETRYING' THEN 'retrying'::execution_status
  WHEN 'RETRY_SCHEDULED' THEN 'retry_scheduled'::execution_status
  WHEN 'RECLAIMING' THEN 'reclaimable'::execution_status
  WHEN 'RECLAIMABLE' THEN 'reclaimable'::execution_status
  WHEN 'TIMED_OUT' THEN 'failed'::execution_status
  WHEN 'SUCCEEDED' THEN 'completed'::execution_status
  WHEN 'COMPLETED' THEN 'completed'::execution_status
  WHEN 'FAILED' THEN 'failed'::execution_status
  WHEN 'CANCELLED' THEN 'cancelled'::execution_status
  WHEN 'DLQ' THEN 'failed'::execution_status
  ELSE "status"
END;
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
