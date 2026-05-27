import { describe, expect, it, vi } from 'vitest';
import { OpsV1Service } from './ops-v1.service';

describe('OpsV1Service', () => {
  it('returns f1 status with real shape and not configured-only status', async () => {
    const svc = new OpsV1Service({
      listDlq: vi.fn(),
      requeue: vi.fn(),
      discard: vi.fn(),
      metrics: vi.fn(),
      stale: vi.fn(),
      reset: vi.fn(),
      f1Status: vi.fn(async () => ({
        status: 'degraded',
        window: '15m',
        workers: { runtime: { status: 'unknown' } },
        queues: { executionDispatch: { name: 'execution.dispatch', status: 'ok', backlog: 0 } },
        executions: { active: 0, queued: 0, succeeded: 0, failed: 0, dlq: 0, reclaimed: 0 },
        rates: { successRate: null, reclaimRate: null, dlqRate: null },
        latencies: { dispatchToStartP50Ms: null, dispatchToStartP95Ms: null, executionDurationP50Ms: null, executionDurationP95Ms: null },
        timestamp: new Date().toISOString(),
      })),
    } as any);

    const res = await svc.f1Status('t1', 15);
    expect(res).toHaveProperty('status');
    expect(res).toHaveProperty('workers');
    expect(res).toHaveProperty('queues');
    expect(res).toHaveProperty('executions');
    expect(res).toHaveProperty('rates');
    expect(res).toHaveProperty('latencies');
    expect(res.status).not.toBe('configured');
  });
});
