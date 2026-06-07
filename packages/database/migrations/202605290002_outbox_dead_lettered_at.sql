ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "dead_lettered_at" timestamp with time zone;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_outbox_unpublished";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_outbox_tenant_unpublished";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_unpublished" ON "outbox_events" USING btree ("published_at", "created_at") WHERE published_at IS NULL AND dead_lettered_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_tenant_unpublished" ON "outbox_events" USING btree ("tenant_id", "created_at") WHERE published_at IS NULL AND dead_lettered_at IS NULL;
