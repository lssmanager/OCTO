import { describe, expect, it } from 'vitest';
import { calculateF1Rates, deriveDispatchQueueStatus, F1StatusService } from './f1-status.service';

describe('F1StatusService operational semantics', () => {
  it('reports a worker without heartbeat as unknown, never ok', () => {
    const service = new F1StatusService() as any;
    const worker = service.projectWorker(undefined, 90);

    expect(worker.status).toBe('unknown');
    expect(worker.status).not.toBe('ok');
    expect(worker.reason).toBe('no_heartbeat_source');
  });

  it('reports fresh worker heartbeat as ok', () => {
    const service = new F1StatusService() as any;
    const worker = service.projectWorker(
      {
        worker_type: 'runtime-worker',
        instance_id: 'runtime-1',
        status: 'ok',
        started_at: new Date(),
        last_heartbeat_at: new Date(),
      },
      90
    );

    expect(worker.status).toBe('ok');
    expect(worker.workerType).toBe('runtime-worker');
  });

  it('reports stale worker heartbeat as degraded', () => {
    const service = new F1StatusService() as any;
    const worker = service.projectWorker(
      {
        worker_type: 'scheduler-worker',
        instance_id: 'scheduler-1',
        status: 'ok',
        started_at: new Date(Date.now() - 120_000),
        last_heartbeat_at: new Date(Date.now() - 120_000),
      },
      90
    );

    expect(worker.status).toBe('degraded');
    expect(worker.reason).toBe('heartbeat_stale');
  });

  it('marks execution.dispatch degraded when backlog exceeds threshold', () => {
    expect(deriveDispatchQueueStatus(250, 100)).toBe('degraded');
    expect(deriveDispatchQueueStatus(100, 100)).toBe('ok');
  });

  it('calculates success, reclaim and dlq rates', () => {
    expect(
      calculateF1Rates({
        succeeded: 8,
        failed: 2,
        cancelled: 0,
        reclaimed: 3,
        active: 1,
        queued: 1,
        dlq: 1,
      })
    ).toEqual({
      successRate: 0.8,
      reclaimRate: 0.25,
      dlqRate: 1 / 11,
    });
  });
});
