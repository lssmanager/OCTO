import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QUEUES } from '@octo/queue';

const add = vi.fn(async () => undefined);
const createQueue = vi.fn(() => ({ add }));
const casReclaim = vi.fn(async () => 'reclaimed');
const reclaimedCounter = { add: vi.fn() };
const alreadyTakenCounter = { add: vi.fn() };
const reclaimErrorCounter = { add: vi.fn() };

vi.mock('@octo/queue', () => ({
  QUEUES: { EXECUTION_DISPATCH: 'execution.dispatch' },
  createQueue,
}));

vi.mock('./cas-reclaim', () => ({ casReclaim }));
vi.mock('./metrics', () => ({ reclaimedCounter, alreadyTakenCounter, reclaimErrorCounter }));

import { startReclaimLoop, stopReclaimLoop } from './reclaim-loop';

describe('reclaim loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    add.mockClear();
    createQueue.mockClear();
    casReclaim.mockClear();
  });

  afterEach(async () => {
    await stopReclaimLoop();
    vi.useRealTimers();
  });

  it('re-enqueues reclaimed zombies into execution.dispatch with deterministic reclaim jobId', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => ([{ id: 'exec-1', attempt: 2, task: { tenantId: 'tenant-1' }, traceId: 'trace-1' }]),
        }),
      }),
    };

    await startReclaimLoop(db as never, 'redis://localhost:6379', { intervalMs: 10, leaseTimeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(15);

    expect(createQueue).toHaveBeenCalledWith(QUEUES.EXECUTION_DISPATCH, { redisUrl: 'redis://localhost:6379' });
    expect(add).toHaveBeenCalledWith(
      QUEUES.EXECUTION_DISPATCH,
      expect.objectContaining({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        reason: 'reclaim_replay',
        attempt: 3,
      }),
      expect.objectContaining({ jobId: 'reclaim:exec-1:3', attempts: 3 })
    );
  });
});
