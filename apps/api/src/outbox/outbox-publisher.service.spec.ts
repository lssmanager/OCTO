import { describe, expect, it, vi } from 'vitest';
import { buildOutboxPublisher } from './outbox-publisher.service';
import type { OutboxRow } from '@octo/events';

const row: OutboxRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: 't1',
  aggregateType: 'execution',
  aggregateId: 'e1',
  eventType: 'ExecutionStarted',
  sequence: 1,
  publishAttempts: 0,
  payloadJson: {
    executionId: 'e1',
    _meta: {
      traceId: 'tr',
      spanId: 'sp',
      occurredAt: '2026-01-01T00:00:00Z',
      schemaVersion: '1.0',
    },
  },
};

describe('Outbox publisher (fake bus first)', () => {
  it('publishes to fake bus then marks published', async () => {
    const db = {
      tryAdvisoryLock: vi.fn().mockResolvedValue(true),
      fetchUnpublished: vi.fn().mockResolvedValue([row]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(1),
      moveToDlq: vi.fn().mockResolvedValue(undefined),
      pendingCount: vi.fn().mockResolvedValue(0),
    };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const metrics = {
      setPendingTotal: vi.fn(),
      observePublishLatencyMs: vi.fn(),
      observeBatchSize: vi.fn(),
      incPublishFailed: vi.fn(),
      incDlqTotal: vi.fn(),
    };

    const publisher = buildOutboxPublisher({ db, bus, metrics });
    const res = await publisher.publishOnce();

    expect(res.published).toBe(1);
    expect(bus.publish).toHaveBeenCalledOnce();
    expect(db.markPublished).toHaveBeenCalledWith(row.id, row.tenantId);
  });

  it('does not mark published when fake bus fails and retries are tracked', async () => {
    const db = {
      tryAdvisoryLock: vi.fn().mockResolvedValue(true),
      fetchUnpublished: vi.fn().mockResolvedValue([row]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(2),
      moveToDlq: vi.fn().mockResolvedValue(undefined),
      pendingCount: vi.fn().mockResolvedValue(1),
    };
    const bus = { publish: vi.fn().mockRejectedValue(new Error('fake bus down')) };
    const metrics = {
      setPendingTotal: vi.fn(),
      observePublishLatencyMs: vi.fn(),
      observeBatchSize: vi.fn(),
      incPublishFailed: vi.fn(),
      incDlqTotal: vi.fn(),
    };

    const publisher = buildOutboxPublisher({ db, bus, metrics });
    const res = await publisher.publishOnce();

    expect(res.failed).toBe(1);
    expect(db.markPublished).not.toHaveBeenCalled();
    expect(db.recordFailure).toHaveBeenCalledWith(row.id, 'fake bus down', row.tenantId);
  });
});
