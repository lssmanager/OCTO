-- F1 durable runtime hardening: stable tool-call identity plus reclaim schema drift repair.

ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "reclaim_count" INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "lease_owner" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "lease_token" TEXT;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "attempt" INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "reclaimed_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "last_checkpoint_id" TEXT;
--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN IF NOT EXISTS "semantic_tool_call_key" TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE "tool_invocations"
SET "semantic_tool_call_key" = "idempotency_key"
WHERE "semantic_tool_call_key" = '';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tool_invocations_semantic_tool_call"
  ON "tool_invocations" ("tenant_id", "execution_id", "semantic_tool_call_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tool_invocations_idempotency"
  ON "tool_invocations" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_lease_owner_token_attempt"
  ON "executions" ("tenant_id", "id", "lease_owner", "lease_token", "attempt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_reclaimed_at"
  ON "executions" ("tenant_id", "reclaimed_at" DESC)
  WHERE "reclaimed_at" IS NOT NULL;
