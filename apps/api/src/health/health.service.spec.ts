// apps/api/src/health/health.service.spec.ts
// E4: Health endpoint unit tests via NestJS Test.
//
// Tests:
//  - /live returns { status: "ok" } unconditionally
//  - /ready returns 503 before DB/Redis are ready
//  - /start returns 503 before markBootstrapped(), 200 after
//
// Uses Vitest + @nestjs/testing. Mocks Redis/DB dependencies.

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    const module: TestingModule = await Test.createTestingModule({ providers: [HealthService] }).compile();
    service = module.get<HealthService>(HealthService);
    controller = new HealthController(service);

    // Simulate module init
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    process.env['DATABASE_URL'] = 'postgresql://localhost:5432/octo';
    service.onModuleInit();
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
});
