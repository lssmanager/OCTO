import { EventEnvelopeSchema } from '@octo/contracts';
import type { EventEnvelope } from '@octo/contracts';
import { eventEnvelopeToRedisFields } from './redis-stream-contract';

export const OUTBOX_STREAM_KEY = 'octo.events';
export const OUTBOX_ADVISORY_LOCK_ID = 12345;
export const OUTBOX_POLL_INTERVAL_MS = 500;
export const OUTBOX_BATCH_SIZE = 100;
export const MAX_PUBLISH_ATTEMPTS = 10;

export interface OutboxRow {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  sequence: number;
  payloadJson: Record<string, unknown>;
  publishAttempts: number;
  occurredAt?: string;
  createdAt?: Date;
}

export interface OutboxPublisherDb {
  tryAdvisoryLock: (id: number) => Promise<boolean>;
  fetchUnpublished: (limit: number) => Promise<OutboxRow[]>;
  markPublished: (id: string) => Promise<void>;
  recordFailure: (id: string, error: string) => Promise<number>;
  moveToDlq: (row: OutboxRow, error: string, attempts: number) => Promise<void>;
  pendingCount: () => Promise<number>;
}

export interface OutboxPublisherRedis {
  xadd: (stream: string, id: '*', ...fields: string[]) => Promise<string>;
}

export interface OutboxPublisherMetrics {
  setPendingTotal: (value: number) => void;
  observePublishLatencyMs: (value: number) => void;
  observeBatchSize: (size: number) => void;
  incPublishFailed: () => void;
  incDlqTotal: () => void;
}

export function outboxRowToEnvelope(row: OutboxRow): EventEnvelope {
  const meta = (row.payloadJson._meta ?? {}) as Record<string, unknown>;
  return EventEnvelopeSchema.parse({
    eventId: row.id,
    eventType: row.eventType,
    tenantId: row.tenantId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    sequence: row.sequence,
    traceId: String(meta.traceId ?? ''),
    spanId: String(meta.spanId ?? ''),
    occurredAt: String(meta.occurredAt ?? row.occurredAt ?? new Date().toISOString()),
    schemaVersion: String(meta.schemaVersion ?? '1.0'),
    payload: row.payloadJson,
  });
}

export async function publishOutboxBatch(deps: {
  db: OutboxPublisherDb;
  redis: OutboxPublisherRedis;
  metrics: OutboxPublisherMetrics;
  batchSize?: number;
  maxAttempts?: number;
  stream?: string;
  lockId?: number;
}): Promise<{ published: number; failed: number; lockAcquired: boolean }> {
  const lockAcquired = await deps.db.tryAdvisoryLock(deps.lockId ?? OUTBOX_ADVISORY_LOCK_ID);
  if (!lockAcquired) return { published: 0, failed: 0, lockAcquired: false };

  const limit = deps.batchSize ?? OUTBOX_BATCH_SIZE;
  const rows = await deps.db.fetchUnpublished(limit);
  deps.metrics.observeBatchSize(rows.length);
  deps.metrics.setPendingTotal(await deps.db.pendingCount());

  let published = 0;
  let failed = 0;

  for (const row of rows) {
    const start = Date.now();
    try {
      const envelope = outboxRowToEnvelope(row);
      const fields = eventEnvelopeToRedisFields(envelope);
      await deps.redis.xadd(deps.stream ?? OUTBOX_STREAM_KEY, '*', ...fields);
      await deps.db.markPublished(row.id);
      deps.metrics.observePublishLatencyMs(Date.now() - start);
      published += 1;
    } catch (error) {
      failed += 1;
      deps.metrics.incPublishFailed();
      const attempts = await deps.db.recordFailure(row.id, error instanceof Error ? error.message : String(error));
      if (attempts >= (deps.maxAttempts ?? MAX_PUBLISH_ATTEMPTS)) {
        await deps.db.moveToDlq(row, error instanceof Error ? error.message : String(error), attempts);
        deps.metrics.incDlqTotal();
      }
    }
  }

  return { published, failed, lockAcquired: true };
}
