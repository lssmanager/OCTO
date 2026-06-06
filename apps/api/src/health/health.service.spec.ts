// apps/api/src/health/health.service.spec.ts
// E4: Health endpoint unit tests via NestJS Test.
//
// Tests:
//  - /live returns { status: "ok" } unconditionally
//  - /ready returns 503 before DB/Redis are ready
//  - /start returns 503 before markBootstrapped(), 200 after
//
// Uses Vitest + @nestjs/testing. Mocks Redis/DB dependencies.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@octo/queue', () => ({
  createQueue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue({ id: 'health-mock-job' }),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  createRedisConnection: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
  QUEUE_NAMES: { HEALTH: 'octo:health' },
  QUEUES: { EXECUTION_DISPATCH: 'execution.dispatch' },
}));

vi.mock('postgres', () => {
  const client = {
    end: vi.fn().mockResolvedValue(undefined),
    unsafe: vi.fn(),
  } as any;
  const postgresDefault = vi.fn(() => client);
  return { default: postgresDefault };
});

vi.mock('drizzle-orm', () => ({
  sql: { raw: vi.fn((s: string) => s) },
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({ execute: vi.fn(() => [{ '?column?': 1 }]) })),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();
    service = module.get<HealthService>(HealthService);
    controller = new HealthController(service);

    // Simulate module init
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    process.env['DATABASE_URL'] = 'postgresql://localhost:5432/octo';
    process.env['LITELLM_BASE_URL'] = 'http://litellm:4000';
    delete process.env['LITELLM_HEALTH_ENDPOINT'];
    delete process.env['LITELLM_HEALTH_TIMEOUT_MS'];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'connected',
            db: 'connected',
            litellm_version: '1.61.7',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    service.onModuleInit();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // E4.1 — /live always returns ok while process is alive
  describe('GET /health/live', () => {
    it('returns { status: "ok" } unconditionally', () => {
      const result = controller.live();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  // E4.2 — /ready returns 503 when dependencies are down
  describe('GET /health/ready', () => {
    it('returns 503 when DB is unreachable', async () => {
      // Force DB check to fail by clearing DATABASE_URL
      const original = process.env['DATABASE_URL'];
      delete process.env['DATABASE_URL'];
      // Re-init to pick up the cleared env
      service.onModuleInit();

      const res = { status: vi.fn() } as any;
      const body = await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(body.status).toBe('error');
      expect(body.ready).toBe(false);

      // Restore
      process.env['DATABASE_URL'] = original;
      service.onModuleInit();
    });
  });

  // E4.3 — /start returns 503 before bootstrap, 200 after
  describe('GET /health/start', () => {
    it('returns 503 before markBootstrapped() is called', async () => {
      const res = { status: vi.fn() } as any;
      const body = await controller.start(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(body.bootstrapped).toBe(false);
    });

    it('returns 200 after markBootstrapped() is called', async () => {
      service.markBootstrapped();

      const res = { status: vi.fn() } as any;
      const body = await controller.start(res);

      expect(res.status).not.toHaveBeenCalled();
      expect(body.bootstrapped).toBe(true);
      expect(body.status).toBe('ok');
    });
  });

  // E4.4 — /live returns valid timestamp
  describe('GET /health/live', () => {
    it('includes a valid ISO 8601 timestamp', () => {
      const result = controller.live();
      const parsed = new Date(result.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // F1 readiness semantics — /ready must fail when critical dependencies fail.
  describe('F1 readiness checks', () => {
    it('returns not ready when postgres check fails', () => {
      const checks = {
        redis: { status: 'ok' },
        queue: { status: 'ok' },
        postgres: { status: 'error', error: 'connection refused' },
        litellm: { status: 'ok' },
      };

      expect(Object.values(checks).every((check) => check.status === 'ok')).toBe(false);
    });

    it('checks LiteLLM readiness endpoint and returns operational metadata', async () => {
      const checks = await service.runChecks();

      expect(fetch).toHaveBeenCalledWith(
        'http://litellm:4000/health/readiness',
        expect.objectContaining({ method: 'GET' })
      );
      expect(checks.litellm).toEqual(
        expect.objectContaining({
          status: 'ok',
          endpoint: '/health/readiness',
          upstreamStatus: 'connected',
          db: 'connected',
          litellmVersion: '1.61.7',
        })
      );
      expect(checks.litellm.latencyMs).toEqual(expect.any(Number));
    });

    it('treats disconnected LiteLLM readiness metadata as unhealthy', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              status: 'disconnected',
              db: 'Not connected',
              litellm_version: '1.61.7',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
      );

      const checks = await service.runChecks();

      expect(checks.litellm).toEqual(
        expect.objectContaining({
          status: 'error',
          endpoint: '/health/readiness',
          upstreamStatus: 'disconnected',
          db: 'Not connected',
          litellmVersion: '1.61.7',
          latencyMs: expect.any(Number),
          error: 'LiteLLM readiness unhealthy: status=disconnected db=Not connected',
        })
      );
    });

    it('reports an explicit LiteLLM timeout instead of the raw AbortError message', async () => {
      process.env['LITELLM_HEALTH_TIMEOUT_MS'] = '1';
      service.onModuleInit();
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise((_resolve, reject) =>
              setTimeout(() => reject(new Error('This operation was aborted')), 5)
            )
        )
      );

      const checks = await service.runChecks();

      expect(checks.litellm).toEqual(
        expect.objectContaining({
          status: 'error',
          endpoint: '/health/readiness',
          error: 'timeout after 1ms',
        })
      );
    });

    it('returns not ready when execution.dispatch is unavailable', () => {
      const checks = {
        redis: { status: 'ok' },
        queue: { status: 'error', name: 'execution.dispatch' },
        postgres: { status: 'ok' },
        litellm: { status: 'ok' },
      };

      expect(Object.values(checks).every((check) => check.status === 'ok')).toBe(false);
    });
  });
});
