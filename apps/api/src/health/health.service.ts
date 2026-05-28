import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createQueue, createRedisConnection, QUEUE_NAMES, QUEUES, type HealthJobData } from '@octo/queue';
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
    litellm: LiteLLMCheck;
  };
}

interface RedisCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

interface QueueCheck {
  status: 'ok' | 'error';
  name?: string;
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

interface LiteLLMCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

/** Milliseconds before a dependency check is considered timed out */
const CHECK_TIMEOUT_MS = 500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private healthQueue!: Queue<HealthJobData>;
  private redisUrl!: string;
  private dbUrl!: string;
  private litellmUrl!: string;
  private _bootstrapped = false;

  onModuleInit(): void {
    this.redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.dbUrl = process.env['DATABASE_URL'] ?? '';
    this.litellmUrl = process.env['LITELLM_BASE_URL'] ?? 'http://litellm:4000';
    this.healthQueue = createQueue<HealthJobData>(QUEUE_NAMES.HEALTH, {
      redisUrl: this.redisUrl,
    });
  }

  /**
   * Marks bootstrap as complete. Called by main.ts after app.listen().
   * Once set, /api/health/start returns 200 instead of 503.
   */
  markBootstrapped(): void {
    this._bootstrapped = true;
  }

  /** Returns true if bootstrap has completed. */
  isBootstrapped(): boolean {
    return this._bootstrapped;
  }

  async onModuleDestroy(): Promise<void> {
    await this.healthQueue.close();
  }

  /** Run all dependency checks. Used by GET /health and GET /ready. */
  async runChecks(): Promise<HealthStatus['checks']> {
    const [redisCheck, queueCheck, postgresCheck, litellmCheck] = await Promise.all([
      this.checkRedis(),
      this.checkExecutionDispatchQueue(),
      this.checkPostgres(),
      this.checkLiteLLM(),
    ]);
    return { redis: redisCheck, queue: queueCheck, postgres: postgresCheck, litellm: litellmCheck };
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
      { jobId: `health-${Date.now()}` }
    );
    return job.id ?? 'unknown';
  }

  private async checkRedis(): Promise<RedisCheck> {
    const redis = createRedisConnection(this.redisUrl);
    const start = Date.now();
    try {
      await withTimeout(redis.ping(), CHECK_TIMEOUT_MS);
      const latencyMs = Date.now() - start;
      // P4 NOTE: quit() is intentionally NOT here — it lives in finally
      // to guarantee cleanup even when ping() times out or throws.
      return { status: 'ok', latencyMs };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // PATCH 4: guaranteed cleanup — never throw secondary errors.
      // .catch(() => undefined) silences quit() errors (e.g. already closed).
      await redis.quit().catch(() => undefined);
    }
  }

  private async checkExecutionDispatchQueue(): Promise<QueueCheck> {
    const queue = createQueue(QUEUES.EXECUTION_DISPATCH, {
      redisUrl: this.redisUrl,
    });

    try {
      const [waiting, active, failed] = await withTimeout(
        Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getFailedCount(),
        ]),
        CHECK_TIMEOUT_MS
      );
      return {
        status: 'ok',
        name: QUEUES.EXECUTION_DISPATCH,
        waitingCount: waiting,
        activeCount: active,
        failedCount: failed,
      };
    } catch (err) {
      return {
        status: 'error',
        name: QUEUES.EXECUTION_DISPATCH,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await queue.close().catch(() => undefined);
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
      await withTimeout(drizzle(probeClient).execute(sql`SELECT 1`), CHECK_TIMEOUT_MS);
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

  /**
   * LiteLLM health check — validates the LLM gateway is reachable.
   * Principle #6: All LLM calls go through LiteLLM — must be monitored.
   * Uses LiteLLM's /health/liveliness endpoint (returns 200 when ready).
   */
  private async checkLiteLLM(): Promise<LiteLLMCheck> {
    const start = Date.now();
    try {
      const url = `${this.litellmUrl}/health/liveliness`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
      });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          status: 'error',
          error: `HTTP ${res.status} ${res.statusText}`,
        };
      }

      const latencyMs = Date.now() - start;
      return { status: 'ok', latencyMs };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
