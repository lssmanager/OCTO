import { describe, expect, it, vi } from 'vitest';
import { QUEUES } from '@octo/queue';
import { SchedulerWorker } from './scheduler.worker';

describe('SchedulerWorker', () => {
  it('CAS success enqueues execution.dispatch with deterministic jobId', async () => {
    const repo = { casDispatch: vi.fn(async () => ({ attemptNumber: 1 })) };
    const queue = { add: vi.fn(async () => undefined) };
    const worker = new SchedulerWorker(repo, queue);
    const result = await worker.handleExecutionDispatch({ data: { executionId: 'exec-1', tenantId: 'tenant-1' } });
    expect(result).toBe('dispatched');
    expect(queue.add).toHaveBeenCalledWith(QUEUES.EXECUTION_DISPATCH, expect.objectContaining({ executionId: 'exec-1', tenantId: 'tenant-1', reason: 'scheduled', attempt: 1 }), { jobId: 'exec-1:1' });
  });

  it('CAS conflict is no-op', async () => {
    const repo = { casDispatch: vi.fn(async () => null) };
    const queue = { add: vi.fn(async () => undefined) };
    const worker = new SchedulerWorker(repo, queue);
    const result = await worker.handleExecutionDispatch({ data: { executionId: 'exec-1', tenantId: 'tenant-1' } });
    expect(result).toBe('noop');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
