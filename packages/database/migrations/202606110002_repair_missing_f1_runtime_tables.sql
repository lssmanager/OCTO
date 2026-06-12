-- Repair drifted databases where Drizzle metadata says the F1 migrations ran,
-- but the runtime tables are missing. This migration is intentionally additive
-- and mirrors the F1 runtime table contract used by migrate.ts before runtime
-- role grants are re-applied.

CREATE TABLE IF NOT EXISTS "agent_versions" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "version" INT NOT NULL,
  "config_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN IF NOT EXISTS "agent_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN IF NOT EXISTS "version" INT NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN IF NOT EXISTS "config_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_versions_tenant_agent" ON "agent_versions" ("tenant_id", "agent_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "executions" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'legacy',
  "agent_id" TEXT NOT NULL DEFAULT 'legacy',
  "agent_version_id" TEXT NOT NULL DEFAULT 'legacy',
  "state" TEXT NOT NULL DEFAULT 'pending',
  "version" INT NOT NULL DEFAULT 0,
  "input_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "output_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "attempt_count" INT NOT NULL DEFAULT 0,
  "reclaim_count" INT NOT NULL DEFAULT 0,
  "lease_owner" TEXT,
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMPTZ,
  "cancellation_requested_at" TIMESTAMPTZ,
  "budget_snapshot_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "context_snapshot_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "idempotency_key" TEXT,
  "trigger_source" TEXT NOT NULL DEFAULT 'api',
  "trigger_ref" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt" INT NOT NULL DEFAULT 0,
  "queue_job_id" TEXT,
  "worker_id" TEXT,
  "heartbeat_at" TIMESTAMPTZ,
  "reclaimed_at" TIMESTAMPTZ,
  "task" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "governance" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "result" JSONB,
  "error" JSONB,
  "trace_id" TEXT NOT NULL DEFAULT '',
  "run_id" TEXT NOT NULL DEFAULT '',
  "token_usage" JSONB,
  "cost_usd" JSONB,
  "checkpoint" JSONB,
  "last_checkpoint_id" TEXT,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "agent_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "agent_version_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT 'pending';
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
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "lease_token" TEXT;
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
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "trigger_source" TEXT NOT NULL DEFAULT 'api';
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "trigger_ref" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "attempt" INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "queue_job_id" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "worker_id" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "heartbeat_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "reclaimed_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "task" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "governance" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "result" JSONB;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "error" JSONB;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "trace_id" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "run_id" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "token_usage" JSONB;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "cost_usd" JSONB;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "checkpoint" JSONB;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "last_checkpoint_id" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_steps" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'legacy',
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_index" INT NOT NULL,
  "step_type" TEXT NOT NULL DEFAULT 'checkpoint',
  "state_from" TEXT,
  "state_to" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "input_json" JSONB,
  "output_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ended_at" TIMESTAMPTZ,
  "idempotency_key" TEXT,
  "input" JSONB,
  "output" JSONB,
  "error" JSONB,
  "retry_count" INT NOT NULL DEFAULT 0,
  "last_error" JSONB,
  "trace_id" TEXT,
  "span_id" TEXT,
  "duration_ms" INT,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
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
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "input" JSONB;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "output" JSONB;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "error" JSONB;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "retry_count" INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "last_error" JSONB;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "trace_id" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "span_id" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "duration_ms" INT;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_checkpoints" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'legacy',
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_index" INT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'input',
  "parent_checkpoint_id" TEXT REFERENCES "execution_checkpoints"("id"),
  "state_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "channel_versions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "versions_seen" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "state" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadata" JSONB,
  "worker_id" TEXT,
  "schema_version" INT NOT NULL DEFAULT 1
);
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'input';
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
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "state" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "worker_id" TEXT;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN IF NOT EXISTS "schema_version" INT NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_checkpoint_writes" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'legacy',
  "checkpoint_id" TEXT NOT NULL REFERENCES "execution_checkpoints"("id") ON DELETE CASCADE,
  "task_id" TEXT NOT NULL,
  "task_path" TEXT NOT NULL DEFAULT '',
  "write_index" INT NOT NULL,
  "channel" TEXT NOT NULL,
  "type" TEXT,
  "value_json" JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "execution_checkpoint_writes" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "execution_checkpoint_writes" ADD COLUMN IF NOT EXISTS "task_path" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'legacy',
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_id" TEXT NOT NULL REFERENCES "execution_steps"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "title" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL DEFAULT '',
  "payload_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "timeout_at" TIMESTAMPTZ,
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMPTZ,
  "resolution_json" JSONB
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "execution_id" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "step_id" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "payload_json" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "timeout_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resolved_by" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resolution_json" JSONB;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_invocations" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'legacy',
  "execution_id" TEXT NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "step_id" TEXT NOT NULL REFERENCES "execution_steps"("id") ON DELETE RESTRICT,
  "tool_name" TEXT NOT NULL,
  "tool_kind" TEXT NOT NULL DEFAULT 'builtin',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "args_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "result_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  "approval_id" TEXT REFERENCES "approvals"("id") ON DELETE SET NULL,
  "idempotency_key" TEXT NOT NULL,
  "semantic_tool_call_key" TEXT NOT NULL DEFAULT '',
  "duration_ms" INT,
  "attempt" INT NOT NULL DEFAULT 1,
  "timeout_ms" INT,
  "arguments_hash" TEXT,
  "input_schema_valid" BOOLEAN,
  "output_schema_valid" BOOLEAN,
  "policy_snapshot_json" JSONB,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ended_at" TIMESTAMPTZ,
  "tool_version" TEXT,
  "input" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "output" JSONB,
  "error" JSONB,
  "token_usage" JSONB,
  "span_id" TEXT,
  "trace_id" TEXT,
  "invoked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ
);
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "step_id" TEXT;
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
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "semantic_tool_call_key" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "attempt" INT NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "timeout_ms" INT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "arguments_hash" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "input_schema_valid" BOOLEAN;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "output_schema_valid" BOOLEAN;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "policy_snapshot_json" JSONB;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "tool_version" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "input" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "output" JSONB;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "error" JSONB;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "token_usage" JSONB;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "span_id" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "trace_id" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "invoked_at" TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'legacy',
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL,
  "payload_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "published_at" TIMESTAMPTZ,
  "dead_lettered_at" TIMESTAMPTZ,
  "publish_attempts" INT NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "dead_lettered_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "publish_attempts" INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE worker_type AS ENUM (
    'runtime-worker',
    'scheduler-worker',
    'reclaimer-worker',
    'outbox-publisher-worker'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'runtime-worker';
--> statement-breakpoint
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'scheduler-worker';
--> statement-breakpoint
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'reclaimer-worker';
--> statement-breakpoint
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'outbox-publisher-worker';
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE worker_heartbeat_status AS ENUM (
    'starting',
    'ok',
    'degraded',
    'stopping',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
  "id" TEXT PRIMARY KEY,
  "worker_type" worker_type NOT NULL,
  "instance_id" TEXT NOT NULL,
  "status" worker_heartbeat_status NOT NULL DEFAULT 'starting',
  "started_at" TIMESTAMPTZ NOT NULL,
  "last_heartbeat_at" TIMESTAMPTZ NOT NULL,
  "version" TEXT,
  "commit_sha" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_tenant_state_created" ON "executions" ("tenant_id", "state", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_lease_stale" ON "executions" ("state", "lease_expires_at") WHERE state IN ('RUNNING', 'RECLAIMING', 'DISPATCHED');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_lease_token" ON "executions" ("tenant_id", "id", "attempt", "lease_token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_heartbeat" ON "executions" ("status", "heartbeat_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_tenant_reclaimed" ON "executions" ("tenant_id", "reclaimed_at" DESC) WHERE reclaimed_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_steps_execution_step_index" ON "execution_steps" ("execution_id", "step_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_steps_tenant_execution" ON "execution_steps" ("tenant_id", "execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoints_execution_step_index" ON "execution_checkpoints" ("execution_id", "step_index" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoints_tenant_execution_step" ON "execution_checkpoints" ("tenant_id", "execution_id", "step_index" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoints_parent" ON "execution_checkpoints" ("parent_checkpoint_id") WHERE parent_checkpoint_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checkpoint_writes_tenant_checkpoint_write" ON "execution_checkpoint_writes" ("tenant_id", "checkpoint_id", "write_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_invocations_tenant_execution" ON "tool_invocations" ("tenant_id", "execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_invocations_tenant_status_started" ON "tool_invocations" ("tenant_id", "status", "started_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_invocations_tenant_tool_hash" ON "tool_invocations" ("tenant_id", "tool_name", "arguments_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_tenant_status_timeout" ON "approvals" ("tenant_id", "status", "timeout_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_tenant_execution" ON "approvals" ("tenant_id", "execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_execution_status" ON "approvals" ("execution_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_unpublished" ON "outbox_events" ("published_at", "created_at") WHERE published_at IS NULL AND dead_lettered_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_tenant_unpublished" ON "outbox_events" ("tenant_id", "created_at") WHERE published_at IS NULL AND dead_lettered_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_heartbeats_worker_type_idx" ON "worker_heartbeats" ("worker_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_heartbeats_last_heartbeat_idx" ON "worker_heartbeats" ("last_heartbeat_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_heartbeats_type_instance_uidx" ON "worker_heartbeats" ("worker_type", "instance_id");
--> statement-breakpoint
ALTER TABLE "executions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "executions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_checkpoint_writes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_checkpoint_writes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tool_invocations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approvals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'executions',
    'execution_steps',
    'execution_checkpoints',
    'execution_checkpoint_writes',
    'tool_invocations',
    'approvals',
    'outbox_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'tenant_isolation_' || table_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (COALESCE(current_setting(''app.current_tenant'', true), '''') <> '''' AND tenant_id = current_setting(''app.current_tenant'', true)) WITH CHECK (COALESCE(current_setting(''app.current_tenant'', true), '''') <> '''' AND tenant_id = current_setting(''app.current_tenant'', true))',
        'tenant_isolation_' || table_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;
