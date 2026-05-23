-- F1-DB-003: Tenant isolation RLS baseline.
-- ADR-F1-005 supersedes earlier wording that exempted service workers from RLS.
-- Workers must set app.current_tenant inside the same transaction as business queries.

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
--> statement-breakpoint
UPDATE "agents" SET "tenant_id" = 'legacy' WHERE "tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agents_tenant" ON "agents" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agents' AND policyname = 'tenant_isolation_agents') THEN
    CREATE POLICY "tenant_isolation_agents" ON "agents"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "agent_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_versions' AND policyname = 'tenant_isolation_agent_versions') THEN
    CREATE POLICY "tenant_isolation_agent_versions" ON "agent_versions"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "executions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "executions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'executions' AND policyname = 'tenant_isolation_executions') THEN
    CREATE POLICY "tenant_isolation_executions" ON "executions"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "execution_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'execution_steps' AND policyname = 'tenant_isolation_execution_steps') THEN
    CREATE POLICY "tenant_isolation_execution_steps" ON "execution_steps"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'execution_checkpoints' AND policyname = 'tenant_isolation_execution_checkpoints') THEN
    CREATE POLICY "tenant_isolation_execution_checkpoints" ON "execution_checkpoints"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "execution_checkpoint_writes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "execution_checkpoint_writes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'execution_checkpoint_writes' AND policyname = 'tenant_isolation_execution_checkpoint_writes') THEN
    CREATE POLICY "tenant_isolation_execution_checkpoint_writes" ON "execution_checkpoint_writes"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tool_invocations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tool_invocations' AND policyname = 'tenant_isolation_tool_invocations') THEN
    CREATE POLICY "tenant_isolation_tool_invocations" ON "tool_invocations"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approvals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approvals' AND policyname = 'tenant_isolation_approvals') THEN
    CREATE POLICY "tenant_isolation_approvals" ON "approvals"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outbox_events' AND policyname = 'tenant_isolation_outbox_events') THEN
    CREATE POLICY "tenant_isolation_outbox_events" ON "outbox_events"
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'tenant_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'tenant_isolation_audit_log'
    ) THEN
      CREATE POLICY "tenant_isolation_audit_log" ON "audit_log"
        USING (tenant_id = current_setting('app.current_tenant', true))
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
    END IF;
  END IF;
END $$;
