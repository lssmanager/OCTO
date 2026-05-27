import { describe, expect, it, vi } from 'vitest';
import { QUEUES } from '@octo/queue';
import { ExecutionDispatcherService } from './execution-dispatcher.service';

const dto = { agentId: 'agent-1', input: { hello: 'world' } };

describe('ExecutionDispatcherService', () => {
  it('dispatch enqueues execution.dispatch with deterministic jobId', async () => {
    const repo = { dispatchTx: vi.fn(async () => ({ id: 'exec-1' })) };
    const queue = { add: vi.fn(async () => undefined) };
    const svc = new ExecutionDispatcherService(repo, queue);

    const created = await svc.dispatch(dto, 'tenant-1', 'user-1');
    expect(created.id).toBe('exec-1');
    expect(queue.add).toHaveBeenCalledWith(QUEUES.EXECUTION_DISPATCH, { executionId: 'exec-1', tenantId: 'tenant-1' }, { jobId: 'exec-1', priority: 5 });
  });
});
