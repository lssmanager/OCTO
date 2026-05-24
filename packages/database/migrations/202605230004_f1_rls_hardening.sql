-- F1-DB-004: RLS hardening — enforce non-empty tenant context on all F1 tenant-scoped tables.
-- ADR-F1-005: runtime/application roles MUST NOT use BYPASSRLS.

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
      ('outbox_events', 'tenant_isolation_outbox_events')
    ) AS p(table_name, policy_name)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format('DROP POLICY %I ON %I', policy_name, table_name);
    END IF;

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
