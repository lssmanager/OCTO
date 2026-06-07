import { describe, expect, it, vi } from 'vitest';
import { publishOutboxBatch, type OutboxRow } from '../outbox-publisher';

const row: OutboxRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: 't1',
  aggregateType: 'Execution',
  aggregateId: 'e1',
  eventType: 'ExecutionQueued',
  sequence: 0,
  publishAttempts: 0,
  payloadJson: {
    agentId: 'a1',
    inputHash: 'h1',
    _meta: {
      traceId: 'trace',
      spanId: 'span',
      occurredAt: '2026-05-25T00:00:00.000Z',
      schemaVersion: '1.0',
    },
  },
};

describe('publishOutboxBatch', () => {
  it('publishes and marks row as published', async () => {
    const db = {
      tryAdvisoryLock: vi.fn().mockResolvedValue(true),
      fetchUnpublished: vi.fn().mockResolvedValue([row]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(1),
      moveToDlq: vi.fn().mockResolvedValue(undefined),
      pendingCount: vi.fn().mockResolvedValue(0),
    };
    const redis = { xadd: vi.fn().mockResolvedValue('1-0') };
    const metrics = {
      setPendingTotal: vi.fn(),
      observePublishLatencyMs: vi.fn(),
      observeBatchSize: vi.fn(),
      incPublishFailed: vi.fn(),
      incDlqTotal: vi.fn(),
    };
    const result = await publishOutboxBatch({ db, redis, metrics });
    expect(result.published).toBe(1);
    expect(db.markPublished).toHaveBeenCalledWith(row.id, row.tenantId);
  });

  it('continues publishing safe rows after an invalid event is dead-lettered', async () => {
    const invalid = {
      ...row,
      id: '550e8400-e29b-41d4-a716-446655440001',
      payloadJson: { bad: BigInt(1) } as any,
    };
    const safe = { ...row, id: '550e8400-e29b-41d4-a716-446655440002', sequence: 2 };
    const db = {
      tryAdvisoryLock: vi.fn().mockResolvedValue(true),
      fetchUnpublished: vi.fn().mockResolvedValue([invalid, safe]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(10),
      moveToDlq: vi.fn().mockResolvedValue(undefined),
      pendingCount: vi.fn().mockResolvedValue(2),
    };
    const redis = { xadd: vi.fn().mockResolvedValue('1-0') };
    const metrics = {
      setPendingTotal: vi.fn(),
      observePublishLatencyMs: vi.fn(),
      observeBatchSize: vi.fn(),
      incPublishFailed: vi.fn(),
      incDlqTotal: vi.fn(),
    };

    const result = await publishOutboxBatch({ db, redis, metrics, maxAttempts: 10 });

    expect(result).toMatchObject({ published: 1, failed: 1, lockAcquired: true });
    expect(db.moveToDlq).toHaveBeenCalledWith(
      invalid,
      expect.stringContaining('Do not know how to serialize a BigInt'),
      10
    );
    expect(db.markPublished).toHaveBeenCalledWith(safe.id, safe.tenantId);
  });

  it('continues the batch even when failure recording has a database error', async () => {
    const invalid = {
      ...row,
      id: '550e8400-e29b-41d4-a716-446655440003',
      payloadJson: { bad: BigInt(1) } as any,
    };
    const safe = { ...row, id: '550e8400-e29b-41d4-a716-446655440004', sequence: 2 };
    const db = {
      tryAdvisoryLock: vi.fn().mockResolvedValue(true),
      fetchUnpublished: vi.fn().mockResolvedValue([invalid, safe]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockRejectedValue(new Error('rls denied')),
      moveToDlq: vi.fn().mockResolvedValue(undefined),
      pendingCount: vi.fn().mockResolvedValue(2),
    };
    const redis = { xadd: vi.fn().mockResolvedValue('1-0') };
    const metrics = {
      setPendingTotal: vi.fn(),
      observePublishLatencyMs: vi.fn(),
      observeBatchSize: vi.fn(),
      incPublishFailed: vi.fn(),
      incDlqTotal: vi.fn(),
    };

    const result = await publishOutboxBatch({ db, redis, metrics });

    expect(result).toMatchObject({ published: 1, failed: 1, lockAcquired: true });
    expect(db.moveToDlq).not.toHaveBeenCalled();
    expect(db.markPublished).toHaveBeenCalledWith(safe.id, safe.tenantId);
  });

  it('moves to dlq when max attempts reached', async () => {
    const db = {
      tryAdvisoryLock: vi.fn().mockResolvedValue(true),
      fetchUnpublished: vi.fn().mockResolvedValue([row]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(10),
      moveToDlq: vi.fn().mockResolvedValue(undefined),
      pendingCount: vi.fn().mockResolvedValue(1),
    };
    const redis = { xadd: vi.fn().mockRejectedValue(new Error('redis down')) };
    const metrics = {
      setPendingTotal: vi.fn(),
      observePublishLatencyMs: vi.fn(),
      observeBatchSize: vi.fn(),
      incPublishFailed: vi.fn(),
      incDlqTotal: vi.fn(),
    };
    const result = await publishOutboxBatch({ db, redis, metrics, maxAttempts: 10 });
    expect(result.failed).toBe(1);
    expect(db.moveToDlq).toHaveBeenCalledOnce();
  });
});
