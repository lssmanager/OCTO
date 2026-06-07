-- Issue #311: tenant isolation hardening for hierarchy nodes and tenant-scoped integrity.
--
-- Contract:
--   * Tenant-scoped tables must FORCE RLS.
--   * Policies use the F1 app.current_tenant predicate and deny missing/empty tenant context.
--   * Child rows must reference parent rows in the same tenant via composite (tenant_id, id) FKs.
--
-- Existing environments may already contain legacy rows. Composite FKs are added NOT VALID so
-- they protect all new writes immediately without blocking migration on historical drift.

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOR table_name, policy_name IN
    SELECT * FROM (VALUES
      ('agents', 'tenant_isolation_agents'),
      ('agent_versions', 'tenant_isolation_agent_versions'),
      ('executions', 'tenant_isolation_executions'),
      ('execution_steps', 'tenant_isolation_execution_steps'),
      ('execution_checkpoints', 'tenant_isolation_execution_checkpoints'),
      ('execution_checkpoint_writes', 'tenant_isolation_execution_checkpoint_writes'),
      ('tool_invocations', 'tenant_isolation_tool_invocations'),
      ('approvals', 'tenant_isolation_approvals'),
      ('outbox_events', 'tenant_isolation_outbox_events'),
      ('execution_events', 'tenant_isolation_execution_events'),
      ('execution_dlq', 'tenant_isolation_execution_dlq'),
      ('idempotency_keys', 'tenant_isolation_idempotency_keys'),
      ('outbox_publish_dlq', 'tenant_isolation_outbox_publish_dlq'),
      ('hierarchy_nodes', 'tenant_isolation_hierarchy_nodes')
    ) AS p(table_name, policy_name)
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I
       USING (
         tenant_id = current_setting(''app.current_tenant'', true)
         AND COALESCE(current_setting(''app.current_tenant'', true), '''') <> ''''
       )
       WITH CHECK (
         tenant_id = current_setting(''app.current_tenant'', true)
         AND COALESCE(current_setting(''app.current_tenant'', true), '''') <> ''''
       )',
      policy_name,
      table_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_tenant_id_id_unique" ON "agents" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_versions_tenant_id_id_unique" ON "agent_versions" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "executions_tenant_id_id_unique" ON "executions" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "execution_steps_tenant_id_id_unique" ON "execution_steps" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "execution_checkpoints_tenant_id_id_unique" ON "execution_checkpoints" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "approvals_tenant_id_id_unique" ON "approvals" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_nodes_tenant_id_id_unique" ON "hierarchy_nodes" ("tenant_id", "id");
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.agents') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_parent_tenant_fk') THEN
      ALTER TABLE "agents"
        ADD CONSTRAINT "agents_parent_tenant_fk"
        FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "agents" ("tenant_id", "id")
        ON DELETE SET NULL ("parent_id") NOT VALID;
    END IF;

    IF to_regclass('public.hierarchy_nodes') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_hierarchy_node_tenant_fk') THEN
      ALTER TABLE "agents"
        ADD CONSTRAINT "agents_hierarchy_node_tenant_fk"
        FOREIGN KEY ("tenant_id", "hierarchy_node_id") REFERENCES "hierarchy_nodes" ("tenant_id", "id")
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('public.agent_versions') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_versions_agent_tenant_fk') THEN
    ALTER TABLE "agent_versions"
      ADD CONSTRAINT "agent_versions_agent_tenant_fk"
      FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "agents" ("tenant_id", "id")
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF to_regclass('public.executions') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'executions_agent_tenant_fk') THEN
      ALTER TABLE "executions"
        ADD CONSTRAINT "executions_agent_tenant_fk"
        FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "agents" ("tenant_id", "id")
        ON DELETE RESTRICT NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'executions_agent_version_tenant_fk') THEN
      ALTER TABLE "executions"
        ADD CONSTRAINT "executions_agent_version_tenant_fk"
        FOREIGN KEY ("tenant_id", "agent_version_id") REFERENCES "agent_versions" ("tenant_id", "id")
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('public.execution_steps') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_steps_execution_tenant_fk') THEN
    ALTER TABLE "execution_steps"
      ADD CONSTRAINT "execution_steps_execution_tenant_fk"
      FOREIGN KEY ("tenant_id", "execution_id") REFERENCES "executions" ("tenant_id", "id")
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF to_regclass('public.execution_checkpoints') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_checkpoints_execution_tenant_fk') THEN
      ALTER TABLE "execution_checkpoints"
        ADD CONSTRAINT "execution_checkpoints_execution_tenant_fk"
        FOREIGN KEY ("tenant_id", "execution_id") REFERENCES "executions" ("tenant_id", "id")
        ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_checkpoints_parent_tenant_fk') THEN
      ALTER TABLE "execution_checkpoints"
        ADD CONSTRAINT "execution_checkpoints_parent_tenant_fk"
        FOREIGN KEY ("tenant_id", "parent_checkpoint_id") REFERENCES "execution_checkpoints" ("tenant_id", "id")
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('public.execution_checkpoint_writes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_checkpoint_writes_checkpoint_tenant_fk') THEN
    ALTER TABLE "execution_checkpoint_writes"
      ADD CONSTRAINT "execution_checkpoint_writes_checkpoint_tenant_fk"
      FOREIGN KEY ("tenant_id", "checkpoint_id") REFERENCES "execution_checkpoints" ("tenant_id", "id")
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF to_regclass('public.approvals') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approvals_execution_tenant_fk') THEN
      ALTER TABLE "approvals"
        ADD CONSTRAINT "approvals_execution_tenant_fk"
        FOREIGN KEY ("tenant_id", "execution_id") REFERENCES "executions" ("tenant_id", "id")
        ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approvals_step_tenant_fk') THEN
      ALTER TABLE "approvals"
        ADD CONSTRAINT "approvals_step_tenant_fk"
        FOREIGN KEY ("tenant_id", "step_id") REFERENCES "execution_steps" ("tenant_id", "id")
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('public.tool_invocations') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_invocations_execution_tenant_fk') THEN
      ALTER TABLE "tool_invocations"
        ADD CONSTRAINT "tool_invocations_execution_tenant_fk"
        FOREIGN KEY ("tenant_id", "execution_id") REFERENCES "executions" ("tenant_id", "id")
        ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_invocations_step_tenant_fk') THEN
      ALTER TABLE "tool_invocations"
        ADD CONSTRAINT "tool_invocations_step_tenant_fk"
        FOREIGN KEY ("tenant_id", "step_id") REFERENCES "execution_steps" ("tenant_id", "id")
        ON DELETE RESTRICT NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_invocations_approval_tenant_fk') THEN
      ALTER TABLE "tool_invocations"
        ADD CONSTRAINT "tool_invocations_approval_tenant_fk"
        FOREIGN KEY ("tenant_id", "approval_id") REFERENCES "approvals" ("tenant_id", "id")
        ON DELETE SET NULL ("approval_id") NOT VALID;
    END IF;
  END IF;

  IF to_regclass('public.execution_events') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_events_execution_tenant_fk') THEN
    ALTER TABLE "execution_events"
      ADD CONSTRAINT "execution_events_execution_tenant_fk"
      FOREIGN KEY ("tenant_id", "execution_id") REFERENCES "executions" ("tenant_id", "id")
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF to_regclass('public.execution_dlq') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_dlq_execution_tenant_fk') THEN
    ALTER TABLE "execution_dlq"
      ADD CONSTRAINT "execution_dlq_execution_tenant_fk"
      FOREIGN KEY ("tenant_id", "execution_id") REFERENCES "executions" ("tenant_id", "id")
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF to_regclass('public.hierarchy_nodes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hierarchy_nodes_parent_tenant_fk') THEN
    ALTER TABLE "hierarchy_nodes"
      ADD CONSTRAINT "hierarchy_nodes_parent_tenant_fk"
      FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "hierarchy_nodes" ("tenant_id", "id")
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
