import { describe, expect, it, vi } from 'vitest';
import { OpsV1Service } from './ops-v1.service';

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    listDlq: vi.fn(),
    requeue: vi.fn(),
    discard: vi.fn(),
    metrics: vi.fn(),
    stale: vi.fn(),
    reset: vi.fn(),
    observeExecution: vi.fn(async () => ({
      execution: { id: 'exec-1' },
      timeline: [],
      outbox: [],
      dlq: [],
    })),
    observeTrace: vi.fn(async () => ({ traceId: 'trace-1', executions: [], timeline: [] })),
    f1Status: vi.fn(async () => ({
      status: 'degraded',
      window: '15m',
      workers: { runtime: { status: 'unknown' } },
      queues: { executionDispatch: { name: 'execution.dispatch', status: 'ok', backlog: 0 } },
      executions: { active: 0, queued: 0, succeeded: 0, failed: 0, dlq: 0, reclaimed: 0 },
      rates: { successRate: null, reclaimRate: null, dlqRate: null },
      latencies: {
        dispatchToStartP50Ms: null,
        dispatchToStartP95Ms: null,
        executionDurationP50Ms: null,
        executionDurationP95Ms: null,
      },
      timestamp: new Date().toISOString(),
    })),
    ...overrides,
  };
}

const principal = { tenantId: 'tenant-1', userId: 'user-1', sub: 'user-1' };

describe('OpsV1Service', () => {
  it('returns f1 status with real shape and not configured-only status', async () => {
    const svc = new OpsV1Service(buildDeps() as any);

    const res = await svc.f1Status('t1', 15);
    expect(res).toHaveProperty('status');
    expect(res).toHaveProperty('workers');
    expect(res).toHaveProperty('queues');
    expect(res).toHaveProperty('executions');
    expect(res).toHaveProperty('rates');
    expect(res).toHaveProperty('latencies');
    expect(res.status).not.toBe('configured');
  });

  it('returns real observability lookups by execution and trace', async () => {
    const deps = buildDeps({
      observeExecution: vi.fn(async () => ({
        execution: { id: 'exec-1', traceId: 'trace-1' },
        timeline: [{ eventType: 'ExecutionQueued' }],
        outbox: [],
        dlq: [],
      })),
      observeTrace: vi.fn(async () => ({
        traceId: 'trace-1',
        executions: [{ id: 'exec-1' }],
        timeline: [{ eventType: 'ExecutionQueued' }],
        logs: { filterBy: { traceId: 'trace-1' } },
      })),
    });
    const svc = new OpsV1Service(deps as any);

    await expect(svc.observeExecution(principal, 'exec-1')).resolves.toMatchObject({
      execution: { id: 'exec-1' },
    });
    await expect(svc.observeTrace(principal, 'trace-1')).resolves.toMatchObject({
      traceId: 'trace-1',
    });
    expect(deps.observeExecution).toHaveBeenCalledWith(principal, 'exec-1');
    expect(deps.observeTrace).toHaveBeenCalledWith(principal, 'trace-1');
  });
});
