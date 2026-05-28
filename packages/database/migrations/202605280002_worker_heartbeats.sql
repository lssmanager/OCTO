-- F1 operational worker heartbeats and metrics indexes.

DO $$ BEGIN
  CREATE TYPE worker_type AS ENUM (
    'runtime-worker',
    'scheduler-worker',
    'reclaimer-worker'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
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
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id text PRIMARY KEY,
  worker_type worker_type NOT NULL,
  instance_id text NOT NULL,
  status worker_heartbeat_status NOT NULL DEFAULT 'starting',
  started_at timestamptz NOT NULL,
  last_heartbeat_at timestamptz NOT NULL,
  version text,
  commit_sha text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS worker_heartbeats_type_instance_uidx
  ON worker_heartbeats (worker_type, instance_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS worker_heartbeats_worker_type_idx
  ON worker_heartbeats (worker_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS worker_heartbeats_last_heartbeat_idx
  ON worker_heartbeats (last_heartbeat_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS worker_heartbeats_type_last_heartbeat_idx
  ON worker_heartbeats (worker_type, last_heartbeat_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_executions_tenant_updated
  ON executions (tenant_id, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_executions_tenant_completed
  ON executions (tenant_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_executions_tenant_started
  ON executions (tenant_id, started_at DESC)
  WHERE started_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_executions_tenant_reclaimed
  ON executions (tenant_id, reclaimed_at DESC)
  WHERE reclaimed_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_execution_dlq_tenant_created
  ON execution_dlq (tenant_id, created_at DESC);
