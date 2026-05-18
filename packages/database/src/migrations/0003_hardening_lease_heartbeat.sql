-- Migration: 0003_hardening_lease_heartbeat
-- Sprint:    F0->F1 Hardening (H1)
-- Purpose:   Lease + Heartbeat columns to eliminate zombie executions.
--
-- Rationale:
--   Without a lease, a worker crash leaves executions permanently in
--   status='running' with no recovery path (zombie execution).
--   With a lease, the reclaim scanner detects stale ownership and
--   re-enqueues after lease_expires_at passes.
--
-- Safety: All columns IF NOT EXISTS -- safe to re-run.

-- H1.1 - columns
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS heartbeat_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- H1.2 - composite index for reclaim scanner: WHERE status='running' AND lease_expires_at < now()
CREATE INDEX IF NOT EXISTS idx_executions_lease
  ON executions(status, lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

-- H1.3 - index for heartbeat monitoring
CREATE INDEX IF NOT EXISTS idx_executions_heartbeat
  ON executions(status, heartbeat_at)
  WHERE heartbeat_at IS NOT NULL;

-- Rollback:
--   DROP INDEX IF EXISTS idx_executions_lease;
--   DROP INDEX IF EXISTS idx_executions_heartbeat;
--   ALTER TABLE executions
--     DROP COLUMN IF EXISTS heartbeat_at,
--     DROP COLUMN IF EXISTS lease_expires_at;
