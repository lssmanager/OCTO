/**
 * QueueMetricsService — real-time BullMQ queue health snapshots.
 *
 * Reads job counts directly from Redis via BullMQ Queue.getJobCounts().
 * Returns one QueueMetricsSnapshot per registered queue.
 *
 * Queues monitored (mirrors @octo/queue QUEUE_NAMES):
 *   executions, delegations, tool-invocations, approvals, dlq-executions
 *
 * Architectural note:
 *   This service is read-only. It NEVER modifies queue state.
 *   It lives in the Control Plane (Principle 1) because queue health
 *   is an orchestration concern, not an execution concern.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

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

const QUEUE_NAMES = [
  'executions',
  'delegations',
  'tool-invocations',
  'approvals',
  'dlq-executions',
] as const;

@Injectable()
export class QueueMetricsService implements OnModuleDestroy {
  private readonly queues: Map<string, Queue>;

  constructor() {
    const connection = {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: Number(process.env['REDIS_PORT'] ?? 6379),
      password: process.env['REDIS_PASSWORD'] ?? undefined,
    };

    this.queues = new Map(
      QUEUE_NAMES.map((name) => [
        name,
        new Queue(name, { connection }),
      ]),
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
          'paused',
        );
        return {
          queue:     name,
          waiting:   counts['waiting']   ?? 0,
          active:    counts['active']    ?? 0,
          completed: counts['completed'] ?? 0,
          failed:    counts['failed']    ?? 0,
          delayed:   counts['delayed']   ?? 0,
          paused:    counts['paused']    ?? 0,
          timestamp: now,
        } satisfies QueueMetricsSnapshot;
      }),
    );
    return results;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
