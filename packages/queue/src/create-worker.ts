import { Worker, type Processor } from 'bullmq';
import { createRedisConnection } from './connection';
import type { QueueName } from './queue-names';

export interface WorkerConfig {
  /** Redis connection string */
  redisUrl: string;
  /**
   * Max parallel jobs per worker process.
   * Defaults to 4. Override via WORKER_CONCURRENCY env var.
   */
  concurrency?: number;
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
    // Do not process jobs if Redis is down — wait for reconnection
    autorun: true,
  });

  // Graceful shutdown — drain in-flight jobs before process exit
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[octo:queue] ${signal} received — closing worker '${name}'`);
    await worker.close();
    console.log(`[octo:queue] Worker '${name}' drained and closed.`);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  return worker;
}
