-- Migration: 0001_initial
-- OCTO F0-004: Base schema — agents, executions, execution_events
-- Generated: 2026-05-17
-- Source of truth: packages/database/src/schema/
-- Run via: pnpm db:migrate

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "public"."agent_status" AS ENUM(
    'active',
    'inactive',
    'suspended',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."execution_status" AS ENUM(
    'pending',
    'queued',
    'running',
    'paused',
    'awaiting_approval',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- AGENTS
-- Stores agent topology — delegation hierarchy (parentId FK)
-- governancePolicy: Paperclip budget contract stored as JSONB
-- ============================================================
CREATE TABLE IF NOT EXISTS "agents" (
  "id"                TEXT        PRIMARY KEY,
  "name"              TEXT        NOT NULL,
  "description"       TEXT        NOT NULL DEFAULT '',
  "role"              TEXT        NOT NULL,
  "goal"              TEXT        NOT NULL,
  "parent_id"         TEXT        REFERENCES "agents"("id") ON DELETE SET NULL,
  "capabilities"      JSONB       NOT NULL DEFAULT '[]',
  "governance_policy" JSONB       NOT NULL DEFAULT '{}',
  "status"            "agent_status" NOT NULL DEFAULT 'active',
  "metadata"          JSONB       NOT NULL DEFAULT '{}',
  "created_at"        TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "agents_parent_id_idx" ON "agents"("parent_id");
CREATE INDEX IF NOT EXISTS "agents_status_idx"    ON "agents"("status");

-- ============================================================
-- EXECUTIONS
-- Durable execution state — survives restarts via checkpoint
-- checkpoint: LangGraph serialized graph state for pause/resume (F2)
-- governance: GovernancePolicy snapshot at execution creation time
-- ============================================================
CREATE TABLE IF NOT EXISTS "executions" (
  "id"           TEXT              PRIMARY KEY,
  "agent_id"     TEXT              NOT NULL REFERENCES "agents"("id") ON DELETE RESTRICT,
  "status"       "execution_status" NOT NULL DEFAULT 'pending',
  "task"         JSONB             NOT NULL,
  "governance"   JSONB             NOT NULL,
  "result"       JSONB,
  "error"        JSONB,
  "trace_id"     TEXT              NOT NULL,
  "run_id"       TEXT              NOT NULL,
  "token_usage"  JSONB,
  "checkpoint"   JSONB,
  "started_at"   TIMESTAMP,
  "completed_at" TIMESTAMP,
  "created_at"   TIMESTAMP         NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "executions_agent_id_idx"   ON "executions"("agent_id");
CREATE INDEX IF NOT EXISTS "executions_status_idx"     ON "executions"("status");
CREATE INDEX IF NOT EXISTS "executions_trace_id_idx"   ON "executions"("trace_id");
CREATE INDEX IF NOT EXISTS "executions_created_at_idx" ON "executions"("created_at" DESC);

-- ============================================================
-- EXECUTION EVENTS (Event Sourcing — append-only)
-- bigint PK: sequential, compact, natural sort order for timelines
-- metadata: { traceId, agentId, runId } — reconstruct execution timeline from events alone
-- ============================================================
CREATE TABLE IF NOT EXISTS "execution_events" (
  "id"           BIGINT    PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "execution_id" TEXT      NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "type"         TEXT      NOT NULL,
  "payload"      JSONB     NOT NULL,
  "metadata"     JSONB     NOT NULL,
  "created_at"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "events_execution_id_idx" ON "execution_events"("execution_id");
CREATE INDEX IF NOT EXISTS "events_type_idx"         ON "execution_events"("type");
CREATE INDEX IF NOT EXISTS "events_created_at_idx"   ON "execution_events"("created_at" DESC);
