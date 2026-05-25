-- F1-DB-005: enforce tenant RLS on outbox_publish_dlq table.

ALTER TABLE "outbox_publish_dlq" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_publish_dlq" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outbox_publish_dlq'
      AND policyname = 'tenant_isolation_outbox_publish_dlq'
  ) THEN
    CREATE POLICY "tenant_isolation_outbox_publish_dlq"
      ON "outbox_publish_dlq"
      USING (
        tenant_id = current_setting('app.current_tenant', true)
        AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
      )
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)
        AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
      );
  END IF;
END
$$;
