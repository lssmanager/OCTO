/**
 * Creates a Dead Letter Queue (DLQ) for a given source queue.
 *
 * DLQ characteristics (vs normal queues):
 * - NO retry attempts: jobs arriving here already exhausted all retries
 * - 7-day audit retention (1000 job count cap + age-based expiry)
 * - Separate Redis key namespace via DLQ name prefix
 *
 * Usage:
 *   const dlq = createDlq(QUEUE_NAMES.EXECUTION, { redisUrl });
 */
import { Queue } from 'bullmq';
import { createBullMqConnection } from './connection';
import type { QueueConfig } from './create-queue';
import type { QueueName } from './queue-names';
import { getDlqName } from './dlq-names';

export function createDlq<T = unknown>(sourceQueueName: QueueName, config: QueueConfig): Queue<T> {
  const dlqName = getDlqName(sourceQueueName);
  const connection = createBullMqConnection(config.redisUrl);

  return new Queue<T>(dlqName, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: {
        count: 1_000,
        age: 7 * 24 * 3600,
      },
      ...config.defaultJobOptions,
    },
  }) as Queue<T>;
}
