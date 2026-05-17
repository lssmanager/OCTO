import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import {
  createQueue,
  createRedisConnection,
  QUEUE_NAMES,
  type HealthJobData,
} from '@octo/queue';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  phase: string;
  checks: {
    redis: RedisCheck;
    queue: QueueCheck;
  };
}

interface RedisCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

interface QueueCheck {
  status: 'ok' | 'error';
  waitingCount?: number;
  activeCount?: number;
  failedCount?: number;
  error?: string;
}

@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private healthQueue!: Queue<HealthJobData>;
  private redisUrl!: string;

  onModuleInit(): void {
    this.redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.healthQueue = createQueue<HealthJobData>(QUEUE_NAMES.HEALTH, {
      redisUrl: this.redisUrl,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.healthQueue.close();
  }

  async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const version = process.env['BUILD_VERSION'] ?? '0.0.1-f0';
    const phase = process.env['BUILD_PHASE'] ?? 'F0';

    const [redisCheck, queueCheck] = await Promise.all([
      this.checkRedis(),
      this.checkQueue(),
    ]);

    const allOk = redisCheck.status === 'ok' && queueCheck.status === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp,
      version,
      phase,
      checks: {
        redis: redisCheck,
        queue: queueCheck,
      },
    };
  }

  async enqueueHealthJob(): Promise<string> {
    const job = await this.healthQueue.add(
      'ping',
      {
        triggeredAt: new Date().toISOString(),
        source: 'api-healthcheck',
      },
      { jobId: `health-${Date.now()}` },
    );
    return job.id ?? 'unknown';
  }

  private async checkRedis(): Promise<RedisCheck> {
    const redis = createRedisConnection(this.redisUrl);
    const start = Date.now();
    try {
      await redis.ping();
      const latencyMs = Date.now() - start;
      await redis.quit();
      return { status: 'ok', latencyMs };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async checkQueue(): Promise<QueueCheck> {
    try {
      const [waiting, active, failed] = await Promise.all([
        this.healthQueue.getWaitingCount(),
        this.healthQueue.getActiveCount(),
        this.healthQueue.getFailedCount(),
      ]);
      return {
        status: 'ok',
        waitingCount: waiting,
        activeCount: active,
        failedCount: failed,
      };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
