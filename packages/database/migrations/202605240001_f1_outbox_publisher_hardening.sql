ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "publish_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_error" text;

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "ck_outbox_events_publish_attempts_nonnegative"
  CHECK ("publish_attempts" >= 0);

CREATE INDEX IF NOT EXISTS "idx_outbox_tenant_unpublished"
  ON "outbox_events" ("tenant_id", "created_at")
  WHERE "published_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_outbox_aggregate_sequence"
  ON "outbox_events" ("tenant_id", "aggregate_type", "aggregate_id", "sequence");

CREATE TABLE IF NOT EXISTS "outbox_publish_dlq" (
  "id" text PRIMARY KEY,
  "outbox_event_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_json" jsonb NOT NULL,
  "error_message" text NOT NULL,
  "attempts" integer NOT NULL,
  "moved_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "outbox_publish_dlq"
  ADD CONSTRAINT "ck_outbox_publish_dlq_attempts_nonnegative"
  CHECK ("attempts" >= 0);

CREATE INDEX IF NOT EXISTS "idx_outbox_publish_dlq_tenant_moved_at"
  ON "outbox_publish_dlq" ("tenant_id", "moved_at" DESC);
