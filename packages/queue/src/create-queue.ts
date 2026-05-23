import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from './connection';
import type { QueueName } from './queue-names';

export interface QueueConfig {
  /** Redis connection string, e.g. redis://localhost:6379 */
  redisUrl: string;
  /** Override default job options per queue */
  defaultJobOptions?: Partial<JobsOptions>;
}

/**
 * Creates a BullMQ Queue with OCTO's standard default job options.
 *
 * Default options (F0-003 pattern):
 * - attempts: 3 (exponential backoff)
 * - removeOnComplete: 100 (prevent Redis OOM)
 * - removeOnFail: 500 (keep enough for debugging)
 */
export function createQueue<T = unknown>(name: QueueName | string, config: QueueConfig): Queue<T> {
  const connection = createRedisConnection(config.redisUrl);

  return new Queue<T>(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1_000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
      ...config.defaultJobOptions,
    },
  });
}
