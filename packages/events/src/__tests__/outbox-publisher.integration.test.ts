import { describe, expect, it, vi } from 'vitest';
import { publishOutboxBatch, type OutboxPublisherDb, type OutboxRow } from '../outbox-publisher';

const makeRow = (id: string, sequence: number, createdAt = new Date('2026-05-29T00:00:00.000Z')): OutboxRow => ({
  id,
  tenantId: 'tenant-1',
  aggregateType: 'execution',
  aggregateId: 'exec-1',
  eventType: 'ExecutionQueued',
  sequence,
  publishAttempts: 0,
  createdAt,
  payloadJson: {
    executionId: 'exec-1',
    _meta: {
      traceId: 'trace-1',
      spanId: 'span-1',
      occurredAt: createdAt.toISOString(),
      schemaVersion: '1.0',
      source: 'test',
      service: 'test',
    },
  },
});

function metrics() {
  return {
    setPendingTotal: vi.fn(),
    setOldestUnpublishedAgeMs: vi.fn(),
    setDlqTotal: vi.fn(),
    observePublishLatencyMs: vi.fn(),
    observeBatchSize: vi.fn(),
    incPublishFailed: vi.fn(),
    incDlqTotal: vi.fn(),
  };
}

function db(rows: OutboxRow[], overrides: Partial<OutboxPublisherDb> = {}): OutboxPublisherDb {
  return {
    tryAdvisoryLock: vi.fn(async () => true),
    fetchUnpublished: vi.fn(async () => rows),
    markPublished: vi.fn(async () => undefined),
    recordFailure: vi.fn(async () => 1),
    moveToDlq: vi.fn(async () => undefined),
    pendingCount: vi.fn(async () => rows.length),
    oldestUnpublishedAgeMs: vi.fn(async () => 1000),
    dlqTotal: vi.fn(async () => 0),
    ...overrides,
  };
}

describe('outbox publisher integration contract', () => {
  it('publishes successfully to Redis Stream and marks published only after xadd', async () => {
    const calls: string[] = [];
    const store = db([makeRow('550e8400-e29b-41d4-a716-446655440000', 1)], {
      markPublished: vi.fn(async () => { calls.push('markPublished'); }),
    });
    const redis = { xadd: vi.fn(async () => { calls.push('xadd'); return '1-0'; }) };

    const result = await publishOutboxBatch({ db: store, redis, metrics: metrics() });

    expect(result.published).toBe(1);
    expect(redis.xadd).toHaveBeenCalledOnce();
    expect(store.markPublished).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    expect(calls).toEqual(['xadd', 'markPublished']);
  });

  it('temporary publish failure increments attempts and does not mark published', async () => {
    const store = db([makeRow('550e8400-e29b-41d4-a716-446655440001', 1)]);
    const redis = { xadd: vi.fn(async () => { throw new Error('redis unavailable'); }) };

    const result = await publishOutboxBatch({ db: store, redis, metrics: metrics(), maxAttempts: 3 });

    expect(result.failed).toBe(1);
    expect(store.recordFailure).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', 'redis unavailable');
    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.moveToDlq).not.toHaveBeenCalled();
  });

  it('terminal publish failure moves event to DLQ after max attempts', async () => {
    const row = makeRow('550e8400-e29b-41d4-a716-446655440002', 1);
    const store = db([row], { recordFailure: vi.fn(async () => 3) });
    const redis = { xadd: vi.fn(async () => { throw new Error('bad payload'); }) };

    await publishOutboxBatch({ db: store, redis, metrics: metrics(), maxAttempts: 3 });

    expect(store.moveToDlq).toHaveBeenCalledWith(row, 'bad payload', 3);
  });

  it('preserves per-aggregate event order from claimed rows', async () => {
    const rows = [makeRow('550e8400-e29b-41d4-a716-446655440003', 1), makeRow('550e8400-e29b-41d4-a716-446655440004', 2)];
    const seenSequences: string[] = [];
    const redis = {
      xadd: vi.fn(async (_stream: string, _id: '*', ...fields: string[]) => {
        const sequenceIndex = fields.indexOf('sequence');
        seenSequences.push(fields[sequenceIndex + 1]!);
        return `${seenSequences.length}-0`;
      }),
    };

    await publishOutboxBatch({ db: db(rows), redis, metrics: metrics() });

    expect(seenSequences).toEqual(['1', '2']);
  });
});
