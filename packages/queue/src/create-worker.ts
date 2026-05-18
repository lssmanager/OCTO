import { Worker, type Processor, type Queue } from 'bullmq';
import { createRedisConnection } from './connection';
import { DlqHandler } from './dlq-handler';
import type { QueueName } from './queue-names';

export interface WorkerConfig {
  /** Redis connection string */
  redisUrl: string;
  /**
   * Max parallel jobs per worker process.
   * Defaults to 4. Override via WORKER_CONCURRENCY env var.
   */
  concurrency?: number;
  /**
   * Optional Dead Letter Queue. When provided, a DlqHandler is
   * automatically activated: jobs that exhaust all retry attempts
   * are moved to this queue preserving data + failure metadata.
   *
   * Create with: createDlq(QUEUE_NAMES.YOUR_QUEUE, { redisUrl })
   */
  deadLetterQueue?: Queue;
  /** Optional callback fired after a job is moved to DLQ. */
  onDeadJob?: (job: import('bullmq').Job) => Promise<void>;
}

/**
 * Creates a BullMQ Worker with graceful shutdown support.
 *
 * Graceful shutdown:
 * On SIGTERM, the worker stops accepting new jobs and waits for
 * in-flight jobs to complete before closing the connection.
 * This prevents job corruption during rolling deploys on Coolify.
 *
 * F0-003 pattern: workers are stateless, restartable, disposable.
 *
 * DLQ support:
 * Pass `deadLetterQueue` in config to automatically route exhausted
 * jobs to a dead letter queue. No processor code changes needed.
 */
export function createWorker<T = unknown, R = unknown>(
  name: QueueName | string,
  processor: Processor<T, R>,
  config: WorkerConfig,
): Worker<T, R> {
  const connection = createRedisConnection(config.redisUrl);
  const concurrency = config.concurrency ?? 4;

  const worker = new Worker<T, R>(name, processor, {
    connection,
    concurrency,
    autorun: true,
  });

  // Activate DLQ handler if a dead letter queue was provided
  let dlqHandler: DlqHandler | undefined;
  if (config.deadLetterQueue) {
    dlqHandler = new DlqHandler(
      name,
      config.redisUrl,
      config.deadLetterQueue,
      { onDeadJob: config.onDeadJob },
    );
  }

  // Graceful shutdown — drain in-flight jobs before process exit
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[octo:queue] ${signal} received — closing worker '${name}'`);
    await worker.close();
    if (dlqHandler) await dlqHandler.close();
    console.log(`[octo:queue] Worker '${name}' drained and closed.`);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  return worker;
}
