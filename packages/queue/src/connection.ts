import { Redis } from 'ioredis';

/**
 * Creates a Redis connection suitable for BullMQ.
 *
 * CRITICAL: maxRetriesPerRequest must be null for BullMQ workers.
 * BullMQ uses blocking commands (BRPOP) that hold connections indefinitely.
 * Without null, ioredis throws "Max retries per request limit exceeded" on
 * long-running workers.
 *
 * See: https://docs.bullmq.io/guide/connections
 */
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}
