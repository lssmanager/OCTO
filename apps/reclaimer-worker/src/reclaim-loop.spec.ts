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

vi.mock('./cas-reclaim', () => ({ casReclaim: mocks.casReclaim }));
vi.mock('./metrics', () => ({
  reclaimedCounter: mocks.reclaimedCounter,
  alreadyTakenCounter: mocks.alreadyTakenCounter,
  reclaimErrorCounter: mocks.reclaimErrorCounter,
  requeuedCounter: { add: vi.fn() },
  skippedCounter: { add: vi.fn() },
  failedTerminalCounter: { add: vi.fn() },
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
          where: async () => [
            {
              id: 'exec-1',
              tenantId: 'tenant-1',
              agentId: 'agent-1',
              status: 'running',
              attempt: 2,
              reclaimCount: 0,
              traceId: 'trace-1',
            },
          ],
        }),
      }),
    };

    await startReclaimLoop(db as never, 'redis://localhost:6379', {
      intervalMs: 10,
      leaseTimeoutMs: 1000,
      maxReclaimAttempts: 3,
    });
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
      expect.objectContaining({ jobId: 'reclaim:exec-1:3', attempts: 1 })
    );
  });
});
