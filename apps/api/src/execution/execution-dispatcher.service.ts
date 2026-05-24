import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@octo/queue';
import type { ExecutionCommandQueue } from './ports/execution-command-queue';
import type { CreateExecutionDto, ExecutionControllerRepo } from './ports/execution-controller.repo';

@Injectable()
export class ExecutionDispatcherService {
  private readonly logger = new Logger(ExecutionDispatcherService.name);

  constructor(
    private readonly repo: ExecutionControllerRepo,
    private readonly queue: ExecutionCommandQueue
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
