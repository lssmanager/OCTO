-- F1-RECLAIM-OWNERSHIP: make execution lease ownership explicit and operable.

ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "lease_token" TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_executions_lease_token"
  ON "executions" ("tenant_id", "id", "attempt", "lease_token");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."dlq_reason" ADD VALUE IF NOT EXISTS 'reclaim_max_attempts_exceeded';
  ALTER TYPE "public"."dlq_reason" ADD VALUE IF NOT EXISTS 'stale_ownership';
  ALTER TYPE "public"."dlq_reason" ADD VALUE IF NOT EXISTS 'runtime_non_retryable';
END $$;
--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD COLUMN IF NOT EXISTS "first_failure_at" TIMESTAMP;
--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD COLUMN IF NOT EXISTS "last_failure_at" TIMESTAMP;
--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD COLUMN IF NOT EXISTS "retry_after" TIMESTAMP;
--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD COLUMN IF NOT EXISTS "payload_json" JSONB;
