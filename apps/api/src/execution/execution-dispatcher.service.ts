import { Injectable, Logger } from '@nestjs/common';
import { F1_QUEUE_NAMES } from '@octo/queue';

@Injectable()
export class ExecutionDispatcherService {
  private readonly logger = new Logger(ExecutionDispatcherService.name);
  async enqueueDispatchJob(queue: { add: Function }, executionId: string, payload: Record<string, unknown>) {
    await queue.add(F1_QUEUE_NAMES.EXECUTION_DISPATCH, payload, { jobId: executionId });
    this.logger.log(`enqueued dispatch ${executionId}`);
  }
}
