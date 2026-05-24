-- Legacy reconciliation migration retained for environments that still reference migration id 0004.
-- The original generated migration duplicated F1 schema objects from:
--   * 202605230001_f1_executions_core.sql
--   * 202605230002_f1_tools_approvals_outbox.sql
--   * 202605230003_f1_rls_policies.sql
-- and contained non-idempotent enum mutations that can fail at startup when values already exist.
--
-- This minimized version is intentionally additive + idempotent only.

DO $$ BEGIN
  ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS 'dispatched';
  ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS 'retry_scheduled';
  ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS 'reclaimable';
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'QUEUED';
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'RUNNING';
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
  ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS 'FAILED';
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'PENDING';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'RUNNING';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'FAILED';
  ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'TIMED_OUT';
END $$;
