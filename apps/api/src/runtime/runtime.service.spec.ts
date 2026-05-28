import { describe, expect, it, vi } from 'vitest';
import { QUEUES } from '@octo/queue';
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
