import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SchedulerWorker {
  private readonly logger = new Logger(SchedulerWorker.name);
  buildRuntimeJobId(executionId: string, attempt: number) { return `${executionId}:${attempt}`; }
  onCasConflict(executionId: string) { this.logger.warn({ executionId, casConflict: true, action: 'dispatch' }); }
}
