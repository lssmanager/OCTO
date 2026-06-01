-- F1 tenant isolation expansion: DLQ/idempotency runtime tables must be under RLS too.
ALTER TABLE "execution_dlq" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "execution_dlq" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_execution_dlq ON "execution_dlq";--> statement-breakpoint
CREATE POLICY tenant_isolation_execution_dlq ON "execution_dlq"
  USING (
    tenant_id = current_setting('app.current_tenant', true)
    AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)
    AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
  );--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_idempotency_keys ON "idempotency_keys";--> statement-breakpoint
CREATE POLICY tenant_isolation_idempotency_keys ON "idempotency_keys"
  USING (
    tenant_id = current_setting('app.current_tenant', true)
    AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)
    AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
  );
