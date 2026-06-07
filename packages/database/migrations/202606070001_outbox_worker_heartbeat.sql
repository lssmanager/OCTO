-- F1 queue close gate: include outbox publisher in durable worker heartbeats.

ALTER TYPE worker_type ADD VALUE IF NOT EXISTS 'outbox-publisher-worker';
