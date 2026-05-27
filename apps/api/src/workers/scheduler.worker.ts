import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@octo/queue';

@Injectable()
export class SchedulerWorker {
  private readonly logger = new Logger(SchedulerWorker.name);

  constructor(
    private readonly repo: {
      casDispatch: (executionId: string, tenantId: string, workerId: string) => Promise<{ attemptNumber: number } | null>;
    },
    private readonly queue: { add: (name: string, data: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void> }
  ) {}

  async handleExecutionDispatch(job: { data: { executionId: string; tenantId: string } }): Promise<'dispatched' | 'noop'> {
    const workerId = process.env['WORKER_INSTANCE_ID'] ?? 'scheduler-local';
    const updated = await this.repo.casDispatch(job.data.executionId, job.data.tenantId, workerId);
    if (!updated) {
      this.logger.warn('scheduler_cas_conflict', { executionId: job.data.executionId, tenantId: job.data.tenantId });
      return 'noop';
    }
    await this.queue.add(
      QUEUES.EXECUTION_DISPATCH,
      { executionId: job.data.executionId, tenantId: job.data.tenantId, attemptNumber: updated.attemptNumber },
      { jobId: `${job.data.executionId}:${updated.attemptNumber}` }
    );
    return 'dispatched';
  }
}
