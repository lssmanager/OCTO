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
import { createRedisConnection } from './connection';
import type { QueueName } from './queue-names';

export interface DlqHandlerOptions {
  /** Called after a job is moved to DLQ. Use for alerting or metrics. */
  onDeadJob?: (job: Job) => Promise<void>;
}

export class DlqHandler {
  private readonly events: QueueEvents;
  private readonly dlq: Queue;

  constructor(
    private readonly sourceQueueName: QueueName | string,
    redisUrl: string,
    dlq: Queue,
    private readonly options: DlqHandlerOptions = {},
  ) {
    this.dlq = dlq;
    this.events = new QueueEvents(sourceQueueName, {
      connection: createRedisConnection(redisUrl),
    });

    this.events.on('failed', ({ jobId, failedReason, prev }) => {
      void this.handleFailed(jobId, failedReason, prev);
    });
  }

  private async handleFailed(
    jobId: string,
    failedReason: string,
    _prev: string | undefined,
  ): Promise<void> {
    try {
      // QueueEvents doesn’t give us the full Job object directly.
      // We retrieve it from the source queue to check attempt count.
      // Note: by the time `failed` fires, the job is still in the
      // source queue (in failed state) if removeOnFail > 0.
      const sourceQueue = new Queue(this.sourceQueueName, {
        connection: createRedisConnection(
          // Connection string comes from the QueueEvents connection config;
          // we reconstruct from the stored redisUrl via closure.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.events as any).opts?.connection?.options?.url ??
          (this.events as any).opts?.connection ?? {},
        ),
      });

      const job = await sourceQueue.getJob(jobId);
      if (!job) return;

      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) {
        // Still has retries remaining — not yet dead
        await sourceQueue.close();
        return;
      }

      // Job exhausted all retries — move to DLQ
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
          // Preserve job ID for traceability
          jobId: `dlq:${jobId}`,
          removeOnComplete: false,
        },
      );

      console.log(
        `[octo:dlq] Job ${jobId} from '${this.sourceQueueName}' moved to DLQ after ${job.attemptsMade} attempts. Reason: ${failedReason}`,
      );

      if (this.options.onDeadJob) {
        await this.options.onDeadJob(job);
      }

      await sourceQueue.close();
    } catch (err) {
      console.error(
        `[octo:dlq] Failed to move job ${jobId} to DLQ:`,
        err,
      );
    }
  }

  async close(): Promise<void> {
    await this.events.close();
  }
}
