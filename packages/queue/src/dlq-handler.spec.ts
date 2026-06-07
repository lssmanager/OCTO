import { describe, expect, it, vi } from 'vitest';
import { DlqHandler } from './dlq-handler';

vi.mock('bullmq', () => {
  class QueueEvents {
    handlers: Record<string, Function> = {};
    constructor(_name: string, _opts: unknown) {}
    on(event: string, handler: Function) {
      this.handlers[event] = handler;
    }
    async close() {}
  }
  class Queue {
    constructor(_name: string, _opts: unknown) {}
    async getJob(_id: string) {
      return undefined;
    }
    async close() {}
  }
  return { Queue, QueueEvents };
});

vi.mock('./connection', () => ({
  createBullMqConnection: vi.fn(() => ({ host: 'localhost' })),
}));

describe('DlqHandler', () => {
  it('reuses one source queue instead of opening a Redis connection per failure', async () => {
    const exhaustedJob = {
      id: 'job-1',
      name: 'execute',
      data: { tenantId: 'tenant-a', executionId: 'exec-1' },
      opts: { attempts: 2 },
      attemptsMade: 2,
      stacktrace: ['stack'],
    } as any;
    const sourceQueue = {
      getJob: vi.fn().mockResolvedValue(exhaustedJob),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const dlq = { add: vi.fn().mockResolvedValue(undefined) } as any;
    const onDeadJob = vi.fn().mockResolvedValue(undefined);
    const handler = new DlqHandler('octo-execution', 'redis://localhost:6379', dlq, {
      sourceQueue,
      onDeadJob,
    });

    await (handler as any).handleFailed('job-1', 'boom', undefined);
    await (handler as any).handleFailed('job-1', 'boom-again', undefined);

    expect(sourceQueue.getJob).toHaveBeenCalledTimes(2);
    expect(dlq.add).toHaveBeenCalledTimes(2);
    expect(sourceQueue.close).not.toHaveBeenCalled();
    expect(onDeadJob).toHaveBeenCalledTimes(2);

    await handler.close();
    expect(sourceQueue.close).not.toHaveBeenCalled();
  });

  it('does not move jobs that still have retry attempts remaining', async () => {
    const retryingJob = {
      name: 'execute',
      data: { tenantId: 'tenant-a', executionId: 'exec-2' },
      opts: { attempts: 3 },
      attemptsMade: 1,
      stacktrace: [],
    } as any;
    const sourceQueue = {
      getJob: vi.fn().mockResolvedValue(retryingJob),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const dlq = { add: vi.fn().mockResolvedValue(undefined) } as any;
    const handler = new DlqHandler('octo-execution', 'redis://localhost:6379', dlq, {
      sourceQueue,
    });

    await (handler as any).handleFailed('job-2', 'temporary', undefined);

    expect(dlq.add).not.toHaveBeenCalled();
    expect(sourceQueue.close).not.toHaveBeenCalled();
    await handler.close();
  });
});
