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
  markPublished: (id: string, tenantId?: string) => Promise<void>;
  recordFailure: (id: string, error: string, tenantId?: string) => Promise<number>;
  moveToDlq: (row: OutboxRow, error: string, attempts: number) => Promise<void>;
  pendingCount: () => Promise<number>;
  oldestUnpublishedAgeMs?: () => Promise<number>;
  dlqTotal?: () => Promise<number>;
}

export class RedisStreamOutboxPublisher {
  constructor(
    private readonly redis: OutboxPublisherRedis,
    private readonly stream = OUTBOX_STREAM_KEY
  ) {}

  async publish(event: EventEnvelope): Promise<string> {
    const fields = eventEnvelopeToRedisFields(event);
    return this.redis.xadd(this.stream, '*', ...fields);
  }
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
  setOldestUnpublishedAgeMs?: (value: number) => void;
  setDlqTotal?: (value: number) => void;
}

export function outboxRowToEnvelope(row: OutboxRow): EventEnvelope {
  const meta = (row.payloadJson._meta ?? {}) as Record<string, unknown>;
  const occurredAt = String(
    meta.occurredAt ?? row.occurredAt ?? row.createdAt?.toISOString() ?? new Date().toISOString()
  );
  return EventEnvelopeSchema.parse({
    eventId: row.id,
    eventType: row.eventType,
    tenantId: row.tenantId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    sequence: row.sequence,
    traceId: String(meta.traceId ?? 'unknown-trace'),
    spanId: String(meta.spanId ?? 'unknown-span'),
    occurredAt,
    schemaVersion: String(meta.schemaVersion ?? '1.0'),
    payload: {
      ...row.payloadJson,
      _meta: {
        ...meta,
        traceId: String(meta.traceId ?? 'unknown-trace'),
        spanId: String(meta.spanId ?? 'unknown-span'),
        occurredAt,
        schemaVersion: String(meta.schemaVersion ?? '1.0'),
        source: String(meta.source ?? meta.service ?? 'unknown-service'),
        service: String(meta.service ?? meta.source ?? 'unknown-service'),
      },
    },
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
  console.log(JSON.stringify({ msg: 'outbox_batch_scanned', batchSize: rows.length, limit }));
  deps.metrics.observeBatchSize(rows.length);
  deps.metrics.setPendingTotal(await deps.db.pendingCount());
  if (deps.db.oldestUnpublishedAgeMs && deps.metrics.setOldestUnpublishedAgeMs) {
    deps.metrics.setOldestUnpublishedAgeMs(await deps.db.oldestUnpublishedAgeMs());
  }
  if (deps.db.dlqTotal && deps.metrics.setDlqTotal) {
    deps.metrics.setDlqTotal(await deps.db.dlqTotal());
  }

  let published = 0;
  let failed = 0;

  for (const row of rows) {
    const start = Date.now();
    try {
      const envelope = outboxRowToEnvelope(row);
      const fields = eventEnvelopeToRedisFields(envelope);
      await deps.redis.xadd(deps.stream ?? OUTBOX_STREAM_KEY, '*', ...fields);
      await deps.db.markPublished(row.id, row.tenantId);
      deps.metrics.observePublishLatencyMs(
        row.createdAt ? Date.now() - row.createdAt.getTime() : Date.now() - start
      );
      console.log(
        JSON.stringify({
          msg: 'outbox_event_published',
          eventId: row.id,
          tenantId: row.tenantId,
          executionId: row.aggregateId,
          eventType: row.eventType,
          traceId: envelope.traceId,
          correlationId: (envelope.payload as any)?._meta?.correlationId,
          stream: deps.stream ?? OUTBOX_STREAM_KEY,
        })
      );
      published += 1;
    } catch (error) {
      failed += 1;
      deps.metrics.incPublishFailed();
      console.error(
        JSON.stringify({
          msg: 'outbox_event_publish_failed',
          eventId: row.id,
          tenantId: row.tenantId,
          executionId: row.aggregateId,
          eventType: row.eventType,
          traceId: (row.payloadJson._meta as any)?.traceId,
          correlationId: (row.payloadJson._meta as any)?.correlationId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      const errorMessage = error instanceof Error ? error.message : String(error);
      try {
        const attempts = await deps.db.recordFailure(row.id, errorMessage, row.tenantId);
        if (attempts >= (deps.maxAttempts ?? MAX_PUBLISH_ATTEMPTS)) {
          await deps.db.moveToDlq(row, errorMessage, attempts);
          console.error(
            JSON.stringify({
              msg: 'outbox_event_dead_lettered',
              eventId: row.id,
              tenantId: row.tenantId,
              executionId: row.aggregateId,
              eventType: row.eventType,
              attempts,
            })
          );
          deps.metrics.incDlqTotal();
        }
      } catch (failureError) {
        console.error(
          JSON.stringify({
            msg: 'outbox_event_failure_record_failed',
            eventId: row.id,
            tenantId: row.tenantId,
            executionId: row.aggregateId,
            eventType: row.eventType,
            originalError: errorMessage,
            error: failureError instanceof Error ? failureError.message : String(failureError),
          })
        );
      }
    }
  }

  return { published, failed, lockAcquired: true };
}

export interface OutboxEventBus {
  publish: (event: EventEnvelope) => Promise<void>;
}

export function buildOutboxPublisherWithBus(deps: {
  db: OutboxPublisherDb;
  bus: OutboxEventBus;
  metrics: OutboxPublisherMetrics;
}) {
  return {
    async publishOnce() {
      const redisLike: OutboxPublisherRedis = {
        xadd: async (_stream: string, _id: '*', ...fields: string[]) => {
          const { redisFieldsToEventEnvelope } = await import('./redis-stream-parser');
          const kv: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            kv[String(fields[i])] = String(fields[i + 1] ?? '');
          }
          await deps.bus.publish(EventEnvelopeSchema.parse(redisFieldsToEventEnvelope(kv)));
          return '1-0';
        },
      };
      return publishOutboxBatch({ db: deps.db, redis: redisLike, metrics: deps.metrics });
    },
  };
}

export function createOutboxRedisTransport(redis: OutboxPublisherRedis): OutboxPublisherRedis {
  return {
    xadd: (stream, id, ...fields) => redis.xadd(stream, id, ...fields),
  };
}
