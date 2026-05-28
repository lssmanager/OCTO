import { describe, expect, it, vi } from 'vitest';
import { QUEUES, RESERVED_QUEUES } from '@octo/queue';
import { RuntimeService } from './runtime.service';

describe('RuntimeService', () => {
  it('returns worker statuses from deps (with operational states)', async () => {
    const svc = new RuntimeService({
      health: async () => ({ status: 'degraded' }),
      queues: async () => ({ queues: [{ name: QUEUES.EXECUTION_DISPATCH, waiting: 1, active: 0 }] }),
      workers: async () => ({ workers: [{ name: 'runtime-worker', status: 'unknown' }] }),
      getExecution: async () => null,
      enqueueReclaim: async () => undefined,
      cancelAll: async () => ({ requestedCount: 0, skippedTerminalCount: 0 }),
    });
    const workers = await svc.workers('t1');
    expect(workers.workers[0].status).toBe('unknown');
  });


  it('reports execution.reclaim as not_active when it is reserved and has no F1 consumer', async () => {
    const svc = new RuntimeService({
      health: async () => ({ status: 'ok' }),
      queues: async () => ({
        queues: [
          { name: QUEUES.EXECUTION_DISPATCH, status: 'active', waiting: 2, active: 1 },
          {
            name: RESERVED_QUEUES.EXECUTION_RECLAIM,
            status: 'not_active',
            waiting: 0,
            active: 0,
            reason: 'reserved_for_future_f1_split_no_consumer',
          },
        ],
      }),
      workers: async () => ({ workers: [] }),
      getExecution: async () => null,
      enqueueReclaim: async () => undefined,
      cancelAll: async () => ({ requestedCount: 0, skippedTerminalCount: 0 }),
    });

    const queues = await svc.queues();
    const reclaim = queues.queues.find((queue: any) => queue.name === RESERVED_QUEUES.EXECUTION_RECLAIM);

    expect(reclaim).toMatchObject({
      status: 'not_active',
      waiting: 0,
      active: 0,
    });
  });

  it('throws EXECUTION_NOT_STUCK for non-stale executions', async () => {
    const svc = new RuntimeService({
      health: async () => ({}),
      queues: async () => ({}),
      workers: async () => ({}),
      getExecution: async () => ({ id: 'e1', state: 'running', stale: false }),
      enqueueReclaim: async () => undefined,
      cancelAll: async () => ({ requestedCount: 0, skippedTerminalCount: 0 }),
    });
    await expect(svc.reclaim('t1', 'e1')).rejects.toBeTruthy();
  });
});
