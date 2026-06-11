-- F1 schema drift repair: some long-lived deploy volumes recorded the
-- 202605230002 migration while missing the approvals table. Keep this
-- migration additive so it is safe for healthy databases and repairs the
-- missing table before runtime-role grants are re-applied by migrate.ts.

CREATE TABLE IF NOT EXISTS "approvals" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT,
  "execution_id" TEXT,
  "step_id" TEXT,
  "kind" TEXT,
  "status" TEXT,
  "title" TEXT,
  "reason" TEXT,
  "payload_json" JSONB,
  "timeout_at" TIMESTAMPTZ,
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMPTZ,
  "resolution_json" JSONB
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "execution_id" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "step_id" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "kind" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "status" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "title" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "reason" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "payload_json" JSONB;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "timeout_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resolved_by" TEXT;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resolution_json" JSONB;
--> statement-breakpoint
UPDATE "approvals" SET "tenant_id" = 'legacy' WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "approvals" SET "kind" = 'manual' WHERE "kind" IS NULL;
--> statement-breakpoint
UPDATE "approvals" SET "status" = 'pending' WHERE "status" IS NULL;
--> statement-breakpoint
UPDATE "approvals" SET "title" = '' WHERE "title" IS NULL;
--> statement-breakpoint
UPDATE "approvals" SET "reason" = '' WHERE "reason" IS NULL;
--> statement-breakpoint
UPDATE "approvals" SET "payload_json" = '{}'::jsonb WHERE "payload_json" IS NULL;
--> statement-breakpoint
-- If a prior drifted table existed with rows but without the required parent
-- references, those rows cannot satisfy the canonical F1 contract or the
-- foreign keys below. Remove only those unrecoverable drift rows before
-- restoring NOT NULL constraints so long-lived Coolify volumes can heal.
DELETE FROM "approvals"
WHERE "execution_id" IS NULL
  OR "step_id" IS NULL
  OR NOT EXISTS (SELECT 1 FROM "executions" WHERE "executions"."id" = "approvals"."execution_id")
  OR NOT EXISTS (SELECT 1 FROM "execution_steps" WHERE "execution_steps"."id" = "approvals"."step_id");
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "execution_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "step_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "title" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "reason" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "payload_json" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.approvals'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.executions'::regclass
      AND a.attname = 'execution_id'
  ) THEN
    ALTER TABLE "approvals"
      ADD CONSTRAINT "approvals_execution_fk"
      FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.approvals'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.execution_steps'::regclass
      AND a.attname = 'step_id'
  ) THEN
    ALTER TABLE "approvals"
      ADD CONSTRAINT "approvals_step_fk"
      FOREIGN KEY ("step_id") REFERENCES "execution_steps"("id") ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_tenant_status_timeout" ON "approvals" ("tenant_id", "status", "timeout_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_tenant_execution" ON "approvals" ("tenant_id", "execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_approvals_execution_status" ON "approvals" ("execution_id", "status");
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approvals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approvals' AND policyname = 'tenant_isolation_approvals') THEN
    CREATE POLICY "tenant_isolation_approvals" ON "approvals"
      USING (
        COALESCE(current_setting('app.current_tenant', true), '') <> ''
        AND tenant_id = current_setting('app.current_tenant', true)
      )
      WITH CHECK (
        COALESCE(current_setting('app.current_tenant', true), '') <> ''
        AND tenant_id = current_setting('app.current_tenant', true)
      );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.tool_invocations') IS NOT NULL THEN
    ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "approval_id" TEXT;
    UPDATE "tool_invocations"
      SET "approval_id" = NULL
      WHERE "approval_id" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "approvals" WHERE "approvals"."id" = "tool_invocations"."approval_id");
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_invocations_approval_fk' AND conrelid = 'public.tool_invocations'::regclass) THEN
      ALTER TABLE "tool_invocations"
        ADD CONSTRAINT "tool_invocations_approval_fk"
        FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
