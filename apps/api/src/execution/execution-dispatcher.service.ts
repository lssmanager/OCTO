import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@octo/queue';

export type CreateExecutionDto = {
  agentId: string;
  agentVersionId?: string;
  input: Record<string, unknown>;
};

@Injectable()
export class ExecutionDispatcherService {
  private readonly logger = new Logger(ExecutionDispatcherService.name);

  constructor(
    private readonly repo: {
      dispatchTx: (input: CreateExecutionDto, tenantId: string, createdBy: string) => Promise<{ id: string }>;
    },
    private readonly queue: { add: (name: string, data: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void> }
  ) {}

  async dispatch(input: CreateExecutionDto, tenantId: string, createdBy: string): Promise<{ id: string }> {
    const execution = await this.repo.dispatchTx(input, tenantId, createdBy);
    try {
      await this.enqueueDispatchJob(execution.id, tenantId);
    } catch (error) {
      this.logger.error('execution_dispatch_enqueue_failed', { executionId: execution.id, tenantId, error });
      throw error;
    }
    this.logger.log('execution_dispatch_created', { executionId: execution.id, tenantId, agentId: input.agentId });
    return execution;
  }

  async enqueueDispatchJob(executionId: string, tenantId: string): Promise<void> {
    await this.queue.add(
      QUEUES.EXECUTION_DISPATCH,
      { executionId, tenantId },
      { jobId: executionId, priority: 5 }
    );
  }
}
