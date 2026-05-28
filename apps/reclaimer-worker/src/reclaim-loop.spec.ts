import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QUEUES } from '@octo/queue';

const mocks = vi.hoisted(() => ({
  add: vi.fn(async () => undefined),
  createQueue: vi.fn(() => ({ add: mocks.add })),
  casReclaim: vi.fn(async () => 'reclaimed'),
  reclaimedCounter: { add: vi.fn() },
  alreadyTakenCounter: { add: vi.fn() },
  reclaimErrorCounter: { add: vi.fn() },
}));

vi.mock('@octo/queue', () => ({
  QUEUES: { EXECUTION_DISPATCH: 'execution.dispatch' },
  createQueue: mocks.createQueue,
}));

(vi.mock as any)('@octo/database', () => ({
  executions: {
    id: 'id',
    tenantId: 'tenantId',
    attempt: 'attempt',
    traceId: 'traceId',
    status: 'status',
    leaseExpiresAt: 'leaseExpiresAt',
  },
}), { virtual: true });

vi.mock('./cas-reclaim', () => ({ casReclaim: mocks.casReclaim }));
vi.mock('./metrics', () => ({
  reclaimedCounter: mocks.reclaimedCounter,
  alreadyTakenCounter: mocks.alreadyTakenCounter,
  reclaimErrorCounter: mocks.reclaimErrorCounter,
}));

import { startReclaimLoop, stopReclaimLoop } from './reclaim-loop';

describe('reclaim loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.add.mockClear();
    mocks.createQueue.mockClear();
    mocks.casReclaim.mockClear();
  });

  afterEach(async () => {
    await stopReclaimLoop();
    vi.useRealTimers();
  });

  it('re-enqueues reclaimed zombies into execution.dispatch with deterministic reclaim jobId', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{ id: 'exec-1', tenantId: 'tenant-1', attempt: 2, traceId: 'trace-1' }],
        }),
      }),
    };

    await startReclaimLoop(db as never, 'redis://localhost:6379', { intervalMs: 10, leaseTimeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(15);

    expect(mocks.createQueue).toHaveBeenCalledWith(QUEUES.EXECUTION_DISPATCH, {
      redisUrl: 'redis://localhost:6379',
    });
    expect(mocks.add).toHaveBeenCalledWith(
      QUEUES.EXECUTION_DISPATCH,
      expect.objectContaining({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        reason: 'reclaim_replay',
        attempt: 3,
      }),
      expect.objectContaining({ jobId: 'reclaim:exec-1:3', attempts: 3, priority: 1 })
    );
    const firstQueueName = (mocks.add.mock.calls as unknown as any[][])[0][0];
    expect(firstQueueName).not.toBe('execution');
    expect(firstQueueName).not.toBe('execution.reclaim');
    expect(firstQueueName).not.toBe('runtime.execute');
  });
});
