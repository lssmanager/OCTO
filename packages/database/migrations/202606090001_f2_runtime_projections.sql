BEGIN;

DO $$
BEGIN
  CREATE TYPE execution_source AS ENUM ('live', 'replay');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE replay_execution_mode AS ENUM ('read_only', 'resume_live');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE worker_runtime_state AS ENUM ('ok', 'degraded', 'unknown', 'error', 'not_active');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE timeline_entry_type AS ENUM ('state', 'step', 'tool', 'reclaim', 'retry', 'approval', 'replay');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE timeline_severity AS ENUM ('info', 'warning', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tool_projection_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'timed_out', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tool_side_effect_level AS ENUM ('none', 'low', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE budget_state AS ENUM ('ok', 'pressure', 'exceeded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS source execution_source NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_of_execution_id text,
  ADD COLUMN IF NOT EXISTS replay_from_checkpoint_id text,
  ADD COLUMN IF NOT EXISTS replay_mode replay_execution_mode,
  ADD COLUMN IF NOT EXISTS replay_reason text,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE INDEX IF NOT EXISTS executions_source_idx
  ON executions (source);

CREATE INDEX IF NOT EXISTS executions_dispatched_at_idx
  ON executions (dispatched_at DESC);

CREATE INDEX IF NOT EXISTS executions_replay_of_execution_idx
  ON executions (replay_of_execution_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'executions_replay_source_requires_parent_chk'
  ) THEN
    ALTER TABLE executions
      ADD CONSTRAINT executions_replay_source_requires_parent_chk
      CHECK (source <> 'replay' OR replay_of_execution_id IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'executions_finished_requires_started_chk'
  ) THEN
    ALTER TABLE executions
      ADD CONSTRAINT executions_finished_requires_started_chk
      CHECK (
        finished_at IS NULL
        OR started_at IS NULL
        OR finished_at >= started_at
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'executions_replay_of_execution_fk'
  ) THEN
    ALTER TABLE executions
      ADD CONSTRAINT executions_replay_of_execution_fk
      FOREIGN KEY (replay_of_execution_id) REFERENCES executions(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'executions_replay_from_checkpoint_fk'
  ) THEN
    ALTER TABLE executions
      ADD CONSTRAINT executions_replay_from_checkpoint_fk
      FOREIGN KEY (replay_from_checkpoint_id) REFERENCES execution_checkpoints(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS execution_runtime_projection (
  execution_id text PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  source execution_source NOT NULL DEFAULT 'live',
  status execution_status NOT NULL,
  current_step_index integer,
  retry_count integer NOT NULL DEFAULT 0,
  reclaim_count integer NOT NULL DEFAULT 0,
  dispatched_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_heartbeat_at timestamptz,
  replay_of_execution_id text REFERENCES executions(id) ON DELETE SET NULL,
  replay_from_checkpoint_id text REFERENCES execution_checkpoints(id) ON DELETE SET NULL,
  replay_mode replay_execution_mode,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_runtime_projection_tenant_status_updated
  ON execution_runtime_projection (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_exec_runtime_projection_tenant_execution
  ON execution_runtime_projection (tenant_id, execution_id);

CREATE TABLE IF NOT EXISTS execution_timeline_projection (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  execution_id text NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  timeline_index integer NOT NULL,
  entry_type timeline_entry_type NOT NULL,
  step_index integer,
  severity timeline_severity NOT NULL DEFAULT 'info',
  title text NOT NULL,
  summary text,
  source text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exec_timeline_projection_tenant_event
  ON execution_timeline_projection (tenant_id, execution_id, event_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exec_timeline_projection_tenant_index
  ON execution_timeline_projection (tenant_id, execution_id, timeline_index);

CREATE INDEX IF NOT EXISTS idx_exec_timeline_projection_tenant_execution_timeline
  ON execution_timeline_projection (tenant_id, execution_id, timeline_index ASC);

CREATE TABLE IF NOT EXISTS tool_invocation_projection (
  tool_invocation_id text PRIMARY KEY REFERENCES tool_invocations(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  execution_id text NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  step_index integer,
  tool_name text NOT NULL,
  status tool_projection_status NOT NULL,
  side_effect_level tool_side_effect_level NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  duration_ms integer,
  validated_input_json jsonb,
  validated_output_json jsonb,
  error_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_inv_projection_tenant_execution_updated
  ON tool_invocation_projection (tenant_id, execution_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS worker_runtime_projection (
  worker_type worker_type NOT NULL,
  instance_id text NOT NULL,
  state worker_runtime_state NOT NULL,
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  version text,
  commit_sha text,
  diagnostics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_type, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_runtime_projection_worker_heartbeat
  ON worker_runtime_projection (worker_type, last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS queue_runtime_projection (
  queue_name text PRIMARY KEY,
  backlog integer NOT NULL DEFAULT 0,
  inflight integer NOT NULL DEFAULT 0,
  delayed integer NOT NULL DEFAULT 0,
  failed_recent integer NOT NULL DEFAULT 0,
  dlq_count integer NOT NULL DEFAULT 0,
  oldest_job_age_ms bigint,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_runtime_projection_updated
  ON queue_runtime_projection (updated_at DESC);

CREATE TABLE IF NOT EXISTS execution_cost_projection (
  execution_id text PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  provider text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(18, 8) NOT NULL DEFAULT 0,
  budget_state budget_state NOT NULL DEFAULT 'ok',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_cost_projection_tenant_cost
  ON execution_cost_projection (tenant_id, estimated_cost_usd DESC);

CREATE TABLE IF NOT EXISTS outbox_runtime_projection (
  stream_name text PRIMARY KEY,
  unpublished_count integer NOT NULL DEFAULT 0,
  publish_lag_ms bigint,
  last_failed_event_type text,
  dlq_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_runtime_projection_updated
  ON outbox_runtime_projection (updated_at DESC);

COMMIT;
