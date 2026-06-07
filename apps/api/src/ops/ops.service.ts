// apps/api/src/ops/ops.service.ts
// H1: Ops Console service — aggregates infrastructure status.
// F0-only: build info, service health, Redis/DB/Queue stats.
// No F1+ features.

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { OpsStatus } from '@octo/contracts';
import { HealthService } from '../health/health.service';
import type { Queue } from 'bullmq';
import { createQueue, QUEUE_NAMES, type HealthJobData } from '@octo/queue';

const QUEUE_STATS_TIMEOUT_MS = 500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

@Injectable()
export class OpsService implements OnModuleInit {
  private healthQueue!: Queue<HealthJobData>;
  private startTime: number = Date.now();

  constructor(private readonly healthService: HealthService) {}

  onModuleInit(): void {
    this.healthQueue = createQueue<HealthJobData>(QUEUE_NAMES.HEALTH, {
      redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    });
  }

  async getStatus(): Promise<OpsStatus> {
    const checks = await this.healthService.runChecks();
    const queueStats = await this.getQueueStats();

    return {
      build: {
        version: process.env['BUILD_VERSION'] ?? '0.0.1-f0',
        commit: process.env['BUILD_COMMIT'] ?? 'unknown',
        phase: process.env['BUILD_PHASE'] ?? 'F0',
        builtAt: process.env['BUILD_TIME'] ?? 'unknown',
        node: process.version,
      },
      services: {
        api: {
          status: 'ok',
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
        },
        db: {
          status: checks.postgres.status,
          ...(checks.postgres.latencyMs !== undefined && { latencyMs: checks.postgres.latencyMs }),
          ...(checks.postgres.error !== undefined && { error: checks.postgres.error }),
        },
        redis: {
          status: checks.redis.status,
          ...(checks.redis.latencyMs !== undefined && { latencyMs: checks.redis.latencyMs }),
          ...(checks.redis.error !== undefined && { error: checks.redis.error }),
        },
      },
      queues: queueStats,
      timestamp: new Date().toISOString(),
    };
  }

  private async getQueueStats(): Promise<OpsStatus['queues']> {
    try {
      const [waiting, active, completed, failed, delayed] = await withTimeout(
        Promise.all([
          this.healthQueue.getWaitingCount(),
          this.healthQueue.getActiveCount(),
          this.healthQueue.getCompletedCount(),
          this.healthQueue.getFailedCount(),
          this.healthQueue.getDelayedCount(),
        ]),
        QUEUE_STATS_TIMEOUT_MS
      );
      return {
        [QUEUE_NAMES.HEALTH]: { waiting, active, completed, failed, delayed },
      };
    } catch {
      return {
        [QUEUE_NAMES.HEALTH]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
      };
    }
  }
}
