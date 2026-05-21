-- Migration: 0004_fsm_dispatched_retry_scheduled_reclaimable
-- Sprint:    F0 FSM Alignment
-- Purpose:   Add dispatched, retry_scheduled, and reclaimable states to the
--            execution_status enum to align with the checklist FSM contract.
--
-- New states:
--   dispatched       — BullMQ job dispatched to worker, awaiting pickup
--   retry_scheduled  — Retry scheduled after backoff delay, not yet re-enqueued
--   reclaimable      — Lease expired, execution is reclaimable by scheduler
--
-- Rationale:
--   The original FSM was missing three states defined in the architectural
--   contract. These states enable finer-grained tracking of execution lifecycle:
--   - dispatched bridges the gap between queued and running
--   - retry_scheduled separates "scheduling a retry" from "actively retrying"
--   - reclaimable provides an explicit state for zombie execution recovery
--
-- Safety: All ALTER TYPE statements use IF NOT EXISTS — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTEND execution_status enum
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'dispatched';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'retry_scheduled';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'reclaimable';
EXCEPTION WHEN others THEN NULL;
END $$;

-- Rollback:
--   Removing values from a PostgreSQL enum is not supported.
--   To roll back, create a new type without the values and migrate:
--     CREATE TYPE execution_status_v2 AS ENUM ('pending', 'queued', ...);
--     ALTER TABLE executions ALTER COLUMN status TYPE execution_status_v2
--       USING status::text::execution_status_v2;
--     DROP TYPE execution_status;
--     ALTER TYPE execution_status_v2 RENAME TO execution_status;
