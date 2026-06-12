-- Repair legacy worker_type enums that were created before the full F1 worker set.
-- Some long-lived Coolify databases can have the enum type without every current
-- worker value, which makes durable heartbeat upserts fail at startup.

ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'runtime-worker';
--> statement-breakpoint
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'scheduler-worker';
--> statement-breakpoint
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'reclaimer-worker';
--> statement-breakpoint
ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'outbox-publisher-worker';
