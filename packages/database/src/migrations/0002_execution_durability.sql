-- Migration: 0002_execution_durability
-- Generated for: OCTO F0 — Durable Execution Foundations
-- Apply with: pnpm --filter @octo/database drizzle-kit migrate
-- ADDITIVE ONLY — no DROP TABLE, no DROP COLUMN, no data loss.
-- Safe to apply to a running production database.
-- Rollback: see 0002_execution_durability.down.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- NEW ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE trigger_source AS ENUM (
    'api', 'schedule', 'channel', 'delegation', 'replay'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE step_type AS ENUM (
    'llm_call', 'tool_dispatch', 'delegation', 'reasoning',
    'memory_read', 'memory_write', 'embedding', 'checkpoint', 'approval_gate'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dlq_reason AS ENUM (
    'max_retries_exceeded', 'non_retryable_error', 'governance_limit',
    'timeout', 'poison_message', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE idempotency_key_scope AS ENUM (
    'execution', 'step', 'tool', 'channel'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend execution_status with new states for full F0 state machine
DO $$ BEGIN
  ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'waiting_tool';
  ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'waiting_human';
  ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'retrying';
  ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'suspended';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER executions — add new columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS tenant_id          TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key    TEXT,
  ADD COLUMN IF NOT EXISTS trigger_source     trigger_source NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS trigger_ref        TEXT,
  ADD COLUMN IF NOT EXISTS attempt            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_job_id       TEXT,
  ADD COLUMN IF NOT EXISTS worker_id          TEXT,
  ADD COLUMN IF NOT EXISTS cost_usd           JSONB,
  ADD COLUMN IF NOT EXISTS last_checkpoint_id TEXT;

-- tenant_id is required going forward — backfill existing rows with sentinel
UPDATE executions SET tenant_id = 'system' WHERE tenant_id IS NULL;
ALTER TABLE executions ALTER COLUMN tenant_id SET NOT NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS executions_tenant_id_idx
  ON executions (tenant_id);

CREATE INDEX IF NOT EXISTS executions_tenant_status_idx
  ON executions (tenant_id, status);

CREATE INDEX IF NOT EXISTS executions_worker_id_idx
  ON executions (worker_id);

-- Partial unique index for idempotency (only when key is set)
CREATE UNIQUE INDEX IF NOT EXISTS executions_idempotency_key_uidx
  ON executions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER execution_steps — add new columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE execution_steps
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS last_error      JSONB,
  ADD COLUMN IF NOT EXISTS duration_ms     INTEGER;

-- Migrate step_type from free-form TEXT to enum
-- Step 1: add new typed column
ALTER TABLE execution_steps
  ADD COLUMN IF NOT EXISTS step_type_enum step_type;

-- Step 2: coerce existing values (unknown values fall back to 'reasoning')
UPDATE execution_steps
SET step_type_enum = CASE step_type
  WHEN 'llm_call'       THEN 'llm_call'::step_type
  WHEN 'tool_dispatch'  THEN 'tool_dispatch'::step_type
  WHEN 'delegation'     THEN 'delegation'::step_type
  WHEN 'reasoning'      THEN 'reasoning'::step_type
  WHEN 'memory_read'    THEN 'memory_read'::step_type
  WHEN 'memory_write'   THEN 'memory_write'::step_type
  WHEN 'embedding'      THEN 'embedding'::step_type
  WHEN 'checkpoint'     THEN 'checkpoint'::step_type
  WHEN 'approval_gate'  THEN 'approval_gate'::step_type
  ELSE 'reasoning'::step_type
END
WHERE step_type_enum IS NULL;

-- Step 3: make new column NOT NULL
ALTER TABLE execution_steps ALTER COLUMN step_type_enum SET NOT NULL;

-- NOTE: We keep the old step_type TEXT column for now.
-- Drop it in migration 0003 after application code is updated.

CREATE INDEX IF NOT EXISTS execution_steps_step_type_idx
  ON execution_steps (step_type_enum);

-- Make (execution_id, step_index) explicitly unique
DO $$ BEGIN
  ALTER TABLE execution_steps
    ADD CONSTRAINT execution_steps_execution_step_uidx
    UNIQUE (execution_id, step_index);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER execution_checkpoints — add new columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE execution_checkpoints
  ADD COLUMN IF NOT EXISTS worker_id      TEXT,
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS execution_checkpoints_worker_id_idx
  ON execution_checkpoints (worker_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER execution_events — add OctoEvent envelope columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE execution_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS run_id    TEXT,
  ADD COLUMN IF NOT EXISTS agent_id  TEXT,
  ADD COLUMN IF NOT EXISTS source    TEXT;

-- Backfill required columns on existing rows
UPDATE execution_events SET tenant_id = 'system' WHERE tenant_id IS NULL;
UPDATE execution_events SET run_id    = ''       WHERE run_id    IS NULL;
UPDATE execution_events SET source    = 'unknown' WHERE source   IS NULL;

ALTER TABLE execution_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE execution_events ALTER COLUMN run_id    SET NOT NULL;
ALTER TABLE execution_events ALTER COLUMN source    SET NOT NULL;

-- Add trace_id if it doesn't exist (may already be there as a JSONB key)
ALTER TABLE execution_events
  ADD COLUMN IF NOT EXISTS trace_id TEXT;
UPDATE execution_events SET trace_id = '' WHERE trace_id IS NULL;
ALTER TABLE execution_events ALTER COLUMN trace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS events_tenant_id_idx
  ON execution_events (tenant_id);

CREATE INDEX IF NOT EXISTS events_run_id_idx
  ON execution_events (run_id);

CREATE INDEX IF NOT EXISTS events_trace_id_idx
  ON execution_events (trace_id);

CREATE INDEX IF NOT EXISTS events_tenant_created_at_idx
  ON execution_events (tenant_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- NEW TABLE: idempotency_keys
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  scope        idempotency_key_scope NOT NULL,
  key          TEXT NOT NULL,
  result       JSONB,
  status       TEXT,
  entity_id    TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_tenant_scope_key_uidx
  ON idempotency_keys (tenant_id, scope, key);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx
  ON idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS idempotency_keys_tenant_id_idx
  ON idempotency_keys (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- NEW TABLE: execution_dlq
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_dlq (
  id               TEXT PRIMARY KEY,
  execution_id     TEXT REFERENCES executions(id),
  tenant_id        TEXT NOT NULL,
  reason           dlq_reason NOT NULL,
  attempts_made    INTEGER NOT NULL,
  last_error       JSONB NOT NULL,
  error_chain      JSONB,
  failure_context  JSONB NOT NULL,
  queue_name       TEXT NOT NULL,
  queue_job_id     TEXT NOT NULL,
  trace_id         TEXT,
  run_id           TEXT,
  quarantine       BOOLEAN NOT NULL DEFAULT FALSE,
  notes            TEXT,
  replayed_at      TIMESTAMPTZ,
  replay_run_id    TEXT,
  resolved_at      TIMESTAMPTZ,
  resolved_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dlq_tenant_id_idx    ON execution_dlq (tenant_id);
CREATE INDEX IF NOT EXISTS dlq_execution_id_idx ON execution_dlq (execution_id);
CREATE INDEX IF NOT EXISTS dlq_reason_idx       ON execution_dlq (reason);
CREATE INDEX IF NOT EXISTS dlq_quarantine_idx   ON execution_dlq (quarantine);
CREATE INDEX IF NOT EXISTS dlq_trace_id_idx     ON execution_dlq (trace_id);
CREATE INDEX IF NOT EXISTS dlq_created_at_idx   ON execution_dlq (created_at);
