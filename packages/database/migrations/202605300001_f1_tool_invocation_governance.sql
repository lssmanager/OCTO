-- F1-DB-012: robust governed tool invocation metadata.

ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "attempt" INT NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "timeout_ms" INT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "arguments_hash" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "input_schema_valid" BOOLEAN;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "output_schema_valid" BOOLEAN;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "policy_snapshot_json" JSONB;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_invocation_status') THEN
    ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS 'APPROVAL_REQUIRED';
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_invocations_tenant_tool_hash"
  ON "tool_invocations" ("tenant_id", "tool_name", "arguments_hash");
