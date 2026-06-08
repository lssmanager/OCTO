import { Test } from '@nestjs/testing';
import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env['DATABASE_URL'] =
    process.env['DATABASE_URL'] ?? 'postgresql://octo:octo@localhost:5432/octo_test';
  process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'dev-secret-dev-secret-dev-secret';
  process.env['LITELLM_MASTER_KEY'] = process.env['LITELLM_MASTER_KEY'] ?? 'litellm-master-key-dev';
  process.env['INTERNAL_SECRET'] =
    process.env['INTERNAL_SECRET'] ?? 'internal-secret-dev-internal-secret-dev';
});

describe('Auth module DI wiring', () => {
  it('compiles feature modules with JwtAuthGuard dependencies', async () => {
    const { ExecutionModule } = await import('./execution/execution.module');
    const { AgentModule } = await import('./agents/agent.module');
    const { RuntimeModule } = await import('./runtime/runtime.module');
    const { OpsModule } = await import('./ops/ops.module');

    const moduleRef = await Test.createTestingModule({
      imports: [ExecutionModule, AgentModule, RuntimeModule, OpsModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    // NOTE: close() triggers HealthService.onModuleDestroy which expects live queue
    // infra in this environment; compile success is the DI signal we need.
  }, 20000);
});
