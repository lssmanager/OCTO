import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  createQueue,
  createRedisConnection,
  QUEUE_NAMES,
  type HealthJobData,
} from '@octo/queue';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  commit: string;
  phase: string;
  service: string;
  checks: {
    redis: RedisCheck;
    queue: QueueCheck;
    postgres: PostgresCheck;
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

interface PostgresCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

/** Milliseconds before a dependency check is considered timed out */
const CHECK_TIMEOUT_MS = 500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private healthQueue!: Queue<HealthJobData>;
  private redisUrl!: string;
  private dbUrl!: string;

  onModuleInit(): void {
    this.redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.dbUrl = process.env['DATABASE_URL'] ?? '';
    this.healthQueue = createQueue<HealthJobData>(QUEUE_NAMES.HEALTH, {
      redisUrl: this.redisUrl,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.healthQueue.close();
  }

  /** Run all dependency checks. Used by GET /health and GET /ready. */
  async runChecks(): Promise<HealthStatus['checks']> {
    const [redisCheck, queueCheck, postgresCheck] = await Promise.all([
      this.checkRedis(),
      this.checkQueue(),
      this.checkPostgres(),
    ]);
    return { redis: redisCheck, queue: queueCheck, postgres: postgresCheck };
  }

  async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const version = process.env['BUILD_VERSION'] ?? '0.0.1-f0';
    const commit = process.env['BUILD_COMMIT'] ?? 'unknown';
    const phase = process.env['BUILD_PHASE'] ?? 'F0';

    const checks = await this.runChecks();
    const allOk = Object.values(checks).every((c) => c.status === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp,
      version,
      commit,
      phase,
      service: 'octo-api',
      checks,
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
      await withTimeout(redis.ping(), CHECK_TIMEOUT_MS);
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
      const [waiting, active, failed] = await withTimeout(
        Promise.all([
          this.healthQueue.getWaitingCount(),
          this.healthQueue.getActiveCount(),
          this.healthQueue.getFailedCount(),
        ]),
        CHECK_TIMEOUT_MS,
      );
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

  /**
   * Postgres liveness check — runs SELECT 1 via a short-lived connection.
   * Does NOT use the shared pool from @octo/database to avoid impacting
   * normal traffic. This is an isolated probe connection.
   * Principle #12: PostgreSQL is the system of record — must be monitored.
   */
  private async checkPostgres(): Promise<PostgresCheck> {
    if (!this.dbUrl) {
      return { status: 'error', error: 'DATABASE_URL not configured' };
    }
    const start = Date.now();
    const probeClient = postgres(this.dbUrl, {
      max: 1,
      idle_timeout: 2,
      connect_timeout: 2,
      onnotice: () => undefined,
    });
    try {
      await withTimeout(
        drizzle(probeClient).execute(sql`SELECT 1`),
        CHECK_TIMEOUT_MS,
      );
      const latencyMs = Date.now() - start;
      return { status: 'ok', latencyMs };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await probeClient.end({ timeout: 1 });
    }
  }
}
