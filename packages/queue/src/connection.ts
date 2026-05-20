import { Redis } from 'ioredis';

/**
 * Creates a Redis connection suitable for BullMQ.
 *
 * CRITICAL: maxRetriesPerRequest must be 0 for BullMQ workers.
 * BullMQ uses blocking commands (BRPOP) that hold connections indefinitely.
 * Without this, ioredis throws "Max retries per request limit exceeded" on
 * long-running workers.
 *
 * In ioredis 5+, null is no longer accepted for maxRetriesPerRequest.
 * Use 0 (infinite retries) which is the modern equivalent.
 *
 * See: https://docs.bullmq.io/guide/connections
 */
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}
