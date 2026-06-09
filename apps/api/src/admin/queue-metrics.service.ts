/**
 * QueueMetricsService — real-time BullMQ queue health snapshots.
 *
 * PATCH 9: Redis config now uses REDIS_URL via a single shared IORedis
 * connection (consistent with all system consumers). Eliminates the
 * manual REDIS_HOST/PORT/PASSWORD pattern.
 *
 * PATCH 3: Queue names consumed from MONITORED_QUEUES registry —
 * no magic strings, zero drift when new queues are added.
 *
 * Architectural note:
 *   This service is read-only. It NEVER modifies queue state.
 *   Lives in the Control Plane (Principle 1).
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import {
  createBullMqConnection,
  MONITORED_QUEUES,
  type MonitoredQueueName,
} from '@octo/queue';

export interface QueueMetricsSnapshot {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  timestamp: string;
}

@Injectable()
export class QueueMetricsService implements OnModuleDestroy {
  private readonly connection: ConnectionOptions & { quit?: () => Promise<string> };
  private readonly queues: Map<MonitoredQueueName, Queue>;

  constructor() {
    // PATCH 9: single REDIS_URL — same source of truth as all workers.
    // Uses the shared BullMQ connection helper to avoid pnpm type drift.
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.connection = createBullMqConnection(redisUrl) as ConnectionOptions & {
      quit?: () => Promise<string>;
    };

    // PATCH 3: names from registry — no magic strings.
    // All Queue instances share the same BullMQ-compatible connection.
    this.queues = new Map<MonitoredQueueName, Queue>(
      MONITORED_QUEUES.map((name): [MonitoredQueueName, Queue] => [
        name,
        new Queue(name, { connection: this.connection }),
      ])
    );
  }

  async getMetrics(): Promise<QueueMetricsSnapshot[]> {
    const now = new Date().toISOString();
    const results = await Promise.all(
      [...this.queues.entries()].map(async ([name, queue]) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
          'paused'
        );
        return {
          queue: name,
          waiting: counts['waiting'] ?? 0,
          active: counts['active'] ?? 0,
          completed: counts['completed'] ?? 0,
          failed: counts['failed'] ?? 0,
          delayed: counts['delayed'] ?? 0,
          paused: counts['paused'] ?? 0,
          timestamp: now,
        } satisfies QueueMetricsSnapshot;
      })
    );
    return results;
  }

  async onModuleDestroy(): Promise<void> {
    // Close all Queue instances first, then the shared connection if available.
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    if (typeof this.connection.quit === 'function') {
      await this.connection.quit();
    }
  }
}
