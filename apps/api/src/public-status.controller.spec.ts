import { describe, expect, it, afterEach } from 'vitest';
import { PublicStatusController, renderF1ClosureDashboard } from './public-status.controller';
import { calculateF1ClosureStatus, type F1ClosureStatus } from './public-f1-closure-status.service';

const buildEnvKeys = [
  'BUILD_PHASE',
  'BUILD_VERSION',
  'BUILD_COMMIT',
  'BUILD_TIME',
  'NODE_ENV',
  'F1_AGENT_GRAPH_SMOKE_OK',
  'F1_RUNTIME_HANDOFF_SMOKE_OK',
  'F1_RUNTIME_DB_ROLE_SMOKE_OK',
  'F1_STACK_VERIFIED',
  'F1_OBSERVABILITY_TEST_OK',
  'F1_TENANT_ISOLATION_OK',
  'F1_INTERNAL_STATUS_401_OK',
  'F1_HARDENING_OK',
  'F1_MIGRATIONS_OK',
  'RUNTIME_DATABASE_URL',
  'COOLIFY_URL',
] as const;
const originalEnv = Object.fromEntries(buildEnvKeys.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of buildEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreEnv();
});

function statusFixture(overrides: Partial<F1ClosureStatus> = {}): F1ClosureStatus {
  return {
    overall: {
      status: 'blocked',
      label: 'BLOQUEADO',
      percent: 56,
      canClaim100: false,
      blockingAreas: ['LLM Integration'],
      message: 'F1 no puede declararse 100% hasta que todas las áreas estén OK.',
    },
    metadata: {
      service: 'octo-api',
      phase: 'F1',
      version: '0.1.0-f1-test',
      commit: 'abcdef1234567890',
      builtAt: '2026-06-03T00:00:00Z',
      environment: 'production',
    },
    generatedAt: '2026-06-03T00:00:01Z',
    areas: [
      {
        name: 'Backend',
        status: 'partial',
        percent: 67,
        evidence: [
          '/api/health/live process is serving this page',
          '/api/health/version metadata present',
        ],
        missing: ['public Agent Graph smoke not yet passed'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/health/live',
      },
      {
        name: 'Runtime Foundation',
        status: 'not_verified',
        percent: 0,
        evidence: [],
        missing: ['runtime-worker heartbeat not verified'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/v1/ops/f1/status',
      },
      {
        name: 'Queues',
        status: 'partial',
        percent: 40,
        evidence: ['Redis health ok', 'execution.dispatch queue ok'],
        missing: ['scheduler-worker heartbeat not verified'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/health/ready',
      },
      {
        name: 'DB',
        status: 'partial',
        percent: 33,
        evidence: ['Postgres readiness ok'],
        missing: ['migrations status not verified', 'runtime DB role smoke evidence missing'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/health/ready',
      },
      {
        name: 'LLM Integration',
        status: 'error',
        percent: 0,
        evidence: [],
        missing: ['LiteLLM readiness failed: HTTP 503 Service Unavailable'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/health/ready',
      },
      {
        name: 'Infra',
        status: 'partial',
        percent: 50,
        evidence: [
          'phase/version/commit/build metadata present',
          'octo-api service health serving root surface',
        ],
        missing: ['Coolify deployment URL evidence missing', 'compose/full stack evidence missing'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/health/version',
      },
      {
        name: 'Observabilidad',
        status: 'partial',
        percent: 50,
        evidence: ['health/version metadata include timestamps and build identifiers'],
        missing: ['traceId/executionId/runId/agentId evidence missing'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/v1/ops/f1/status',
      },
      {
        name: 'Seguridad',
        status: 'not_verified',
        percent: 0,
        evidence: [],
        missing: ['401 without secret evidence missing'],
        lastCheckedAt: '2026-06-03T00:00:01Z',
        link: '/api/v1/ops/f1/status',
      },
    ],
    ...overrides,
  };
}

describe('PublicStatusController', () => {
  it('renders a minimal F1 closure dashboard with all required areas and metadata', async () => {
    const controller = new PublicStatusController({
      getStatus: async () => statusFixture(),
    } as any);

    const html = await controller.root();

    expect(html).toContain('<h1>F1 Operational Closure Dashboard</h1>');
    expect(html).toContain('octo-api');
    expect(html).toContain('0.1.0-f1-test');
    expect(html).toContain('abcdef123456');
    expect(html).toContain('Overall status');
    for (const area of [
      'Backend',
      'Runtime Foundation',
      'Queues',
      'DB',
      'LLM Integration',
      'Infra',
      'Observabilidad',
      'Seguridad',
    ]) {
      expect(html).toContain(area);
    }
    expect(html).toContain('/api/f1/closure-status');
    expect(html).not.toContain('Cannot GET /');
  });

  it('does not claim 100% when any area is not OK', async () => {
    const controller = new PublicStatusController({
      getStatus: async () => statusFixture(),
    } as any);

    const html = await controller.root();

    expect(html).toContain('BLOQUEADO');
    expect(html).toContain('F1 no puede declararse 100% hasta que todas las áreas estén OK.');
    expect(html).toContain('LiteLLM readiness failed');
    expect(html).not.toContain('F1 operando al 100%.');
    expect(html).not.toContain('OPERANDO 100%</span>');
  });

  it('escapes build metadata and evidence before embedding it in HTML', () => {
    const html = renderF1ClosureDashboard(
      statusFixture({
        metadata: {
          service: 'octo-api',
          phase: 'F1',
          version: '<script>alert(1)</script>',
          commit: '"quoted"',
          builtAt: 'local',
          environment: 'production',
        },
      })
    );

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('exposes the same structured closure data from the JSON controller method', async () => {
    const fixture = statusFixture();
    const controller = new PublicStatusController({ getStatus: async () => fixture } as any);

    await expect(controller.closureStatus()).resolves.toBe(fixture);
  });
});

describe('calculateF1ClosureStatus', () => {
  it('marks LLM Integration as ERROR and overall as BLOQUEADO when LiteLLM readiness fails', () => {
    process.env['BUILD_PHASE'] = 'F1';
    const result = calculateF1ClosureStatus(
      {
        dependencies: {
          redis: { status: 'ok' },
          queue: { status: 'ok', name: 'execution.dispatch' },
          postgres: { status: 'ok' },
          litellm: { status: 'error', error: 'HTTP 503 Service Unavailable' },
        },
        workers: {},
        workerProbe: { status: 'ok' },
        migrations: { status: 'missing' },
      } as any,
      '2026-06-03T00:00:01Z'
    );

    expect(result.areas.find((area) => area.name === 'LLM Integration')).toMatchObject({
      status: 'error',
      percent: 0,
      missing: ['LiteLLM readiness failed: HTTP 503 Service Unavailable'],
    });
    expect(result.overall.label).toBe('BLOQUEADO');
    expect(result.overall.canClaim100).toBe(false);
    expect(result.overall.percent).toBeLessThan(100);
  });

  it('only claims OPERANDO 100% when every evidence gate is OK', () => {
    process.env['BUILD_PHASE'] = 'F1';
    process.env['BUILD_VERSION'] = '0.1.0-f1';
    process.env['BUILD_COMMIT'] = 'abcdef';
    process.env['BUILD_TIME'] = '2026-06-03T00:00:00Z';
    process.env['NODE_ENV'] = 'production';
    process.env['F1_AGENT_GRAPH_SMOKE_OK'] = 'true';
    process.env['F1_RUNTIME_HANDOFF_SMOKE_OK'] = 'true';
    process.env['F1_RUNTIME_DB_ROLE_SMOKE_OK'] = 'true';
    process.env['F1_STACK_VERIFIED'] = 'true';
    process.env['F1_OBSERVABILITY_TEST_OK'] = 'true';
    process.env['F1_TENANT_ISOLATION_OK'] = 'true';
    process.env['F1_INTERNAL_STATUS_401_OK'] = 'true';
    process.env['F1_HARDENING_OK'] = 'true';
    process.env['RUNTIME_DATABASE_URL'] = 'postgres://runtime';
    process.env['COOLIFY_URL'] = 'https://agents.socialstudies.cloud';

    const result = calculateF1ClosureStatus(
      {
        dependencies: {
          redis: { status: 'ok' },
          queue: { status: 'ok', name: 'execution.dispatch' },
          postgres: { status: 'ok' },
          litellm: { status: 'ok', endpoint: '/health/readiness' },
        },
        workers: Object.fromEntries(
          ['runtime-worker', 'scheduler-worker', 'reclaimer-worker', 'outbox-publisher-worker'].map(
            (workerType) => [
              workerType,
              { status: 'ok', workerType, lastHeartbeatAt: '2026-06-03T00:00:00Z' },
            ]
          )
        ),
        workerProbe: { status: 'ok' },
        migrations: { status: 'ok', lastRunAt: '2026-06-03T00:00:00Z' },
      } as any,
      '2026-06-03T00:00:01Z'
    );

    expect(result.overall.label).toBe('OPERANDO 100%');
    expect(result.overall.percent).toBe(100);
    expect(result.overall.canClaim100).toBe(true);
    expect(result.areas.every((area) => area.status === 'ok')).toBe(true);
  });
});
