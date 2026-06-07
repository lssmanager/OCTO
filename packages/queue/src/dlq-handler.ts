/**
 * DlqHandler — moves exhausted jobs from a source queue to its DLQ.
 *
 * Listens to BullMQ QueueEvents `failed` on the source queue.
 * When a job has exhausted all retry attempts (attemptsMade >= maxAttempts),
 * it moves the job to the corresponding DLQ, preserving:
 *   - job.data (original payload)
 *   - job.failedReason (last error message)
 *   - job.stacktrace (last error stack)
 *   - _dlq_moved_at (ISO timestamp of the final failure)
 *   - _dlq_source_queue (origin queue name for traceability)
 *
 * An optional `onDeadJob` callback fires after the move for alerting,
 * metrics, or further processing (e.g. send to Slack, update DB record).
 *
 * Usage:
 *   const handler = new DlqHandler(QUEUE_NAMES.EXECUTION, redisUrl, dlq);
 *   // handler is self-managed; call handler.close() on shutdown.
 */
import { Queue, QueueEvents, type Job } from 'bullmq';
import { createBullMqConnection } from './connection';
import type { QueueName } from './queue-names';

export interface DlqHandlerOptions {
  /** Called after a job is moved to DLQ. Use for alerting or metrics. */
  onDeadJob?: (job: Job) => Promise<void>;
  /** Test hook for injecting the already-open source queue. */
  sourceQueue?: Pick<Queue, 'getJob' | 'close'>;
}

export class DlqHandler {
  private readonly events: QueueEvents;
  private readonly dlq: Queue;
  private readonly sourceQueue: Pick<Queue, 'getJob' | 'close'>;
  private readonly ownsSourceQueue: boolean;

  constructor(
    private readonly sourceQueueName: QueueName | string,
    redisUrl: string,
    dlq: Queue,
    private readonly options: DlqHandlerOptions = {}
  ) {
    this.dlq = dlq;
    this.sourceQueue =
      options.sourceQueue ??
      new Queue(sourceQueueName, {
        connection: createBullMqConnection(redisUrl),
      });
    this.ownsSourceQueue = !options.sourceQueue;
    this.events = new QueueEvents(sourceQueueName, {
      connection: createBullMqConnection(redisUrl),
    });

    this.events.on('failed', ({ jobId, failedReason, prev }) => {
      void this.handleFailed(jobId, failedReason, prev);
    });
  }

  private async handleFailed(
    jobId: string,
    failedReason: string,
    _prev: string | undefined
  ): Promise<void> {
    try {
      const job = await this.sourceQueue.getJob(jobId);
      if (!job) return;

      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) {
        return;
      }

      await this.dlq.add(
        job.name,
        {
          ...job.data,
          _dlq_source_queue: this.sourceQueueName,
          _dlq_moved_at: new Date().toISOString(),
          _dlq_failed_reason: failedReason,
          _dlq_stacktrace: job.stacktrace ?? [],
          _dlq_original_job_id: jobId,
          _dlq_attempts_made: job.attemptsMade,
        },
        {
          jobId: `dlq:${jobId}`,
          removeOnComplete: false,
        }
      );

      console.log(
        `[octo:dlq] Job ${jobId} from '${this.sourceQueueName}' moved to DLQ after ${job.attemptsMade} attempts. Reason: ${failedReason}`
      );

      if (this.options.onDeadJob) {
        await this.options.onDeadJob(job);
      }
    } catch (err) {
      console.error(`[octo:dlq] Failed to move job ${jobId} to DLQ:`, err);
    }
  }

  async close(): Promise<void> {
    await this.events.close();
    if (this.ownsSourceQueue) {
      await this.sourceQueue.close();
    }
  }
}
