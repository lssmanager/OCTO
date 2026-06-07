import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '@octo/database';
import { HealthService } from './health/health.service';

type DependencyStatus = 'ok' | 'error';
type AreaStatus = 'ok' | 'partial' | 'error' | 'not_verified';
type OverallStatus = 'operating_100' | 'partial' | 'blocked' | 'not_verified';

type DependencyCheck = {
  status: DependencyStatus;
  latencyMs?: number;
  name?: string;
  endpoint?: string;
  upstreamStatus?: string;
  db?: string | null;
  error?: string;
  waitingCount?: number;
  activeCount?: number;
  failedCount?: number;
};

type DependencyChecks = {
  redis: DependencyCheck;
  queue: DependencyCheck;
  postgres: DependencyCheck;
  litellm: DependencyCheck;
};

type WorkerEvidence = {
  status: 'ok' | 'degraded' | 'unknown' | 'error';
  workerType: string;
  instanceId?: string | undefined;
  lastHeartbeatAt?: string | undefined;
  reason?: string | undefined;
};

type ClosureEvidence = {
  dependencies: DependencyChecks;
  workers: Record<string, WorkerEvidence>;
  workerProbe: { status: 'ok' | 'error'; error?: string };
  migrations: { status: 'ok' | 'missing' | 'error'; lastRunAt?: string; error?: string };
};

export type F1ClosureArea = {
  name: string;
  status: AreaStatus;
  percent: number;
  evidence: string[];
  missing: string[];
  lastCheckedAt: string | null;
  link: string;
};

export type F1ClosureStatus = {
  overall: {
    status: OverallStatus;
    label: 'OPERANDO 100%' | 'PARCIAL' | 'BLOQUEADO' | 'NO VERIFICADO';
    percent: number;
    canClaim100: boolean;
    blockingAreas: string[];
    message: string;
  };
  metadata: {
    service: string;
    phase: string;
    version: string;
    commit: string;
    builtAt: string;
    environment: string;
  };
  areas: F1ClosureArea[];
  generatedAt: string;
};

type Gate = {
  ok: boolean;
  label: string;
  missingLabel?: string | undefined;
  error?: string | undefined;
  fatal?: boolean;
};

const workerTypes = [
  'runtime-worker',
  'scheduler-worker',
  'reclaimer-worker',
  'outbox-publisher-worker',
];
const DEFAULT_WORKER_HEARTBEAT_STALE_SECONDS = 90;

function buildMetadata(): F1ClosureStatus['metadata'] {
  return {
    service: 'octo-api',
    phase: process.env['BUILD_PHASE'] ?? 'F1',
    version: process.env['BUILD_VERSION'] ?? '0.1.0-f1',
    commit: process.env['BUILD_COMMIT'] ?? 'local',
    builtAt: process.env['BUILD_TIME'] ?? 'local',
    environment: process.env['NODE_ENV'] ?? 'development',
  };
}

function evidenceFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return (
    value === '1' || value === 'true' || value === 'ok' || value === 'passed' || value === 'yes'
  );
}

function endpointUrl(path: string): string {
  return path;
}

function checkOk(check: DependencyCheck | undefined): boolean {
  return check?.status === 'ok';
}

function checkError(check: DependencyCheck | undefined): string | undefined {
  return check?.status === 'error' ? (check.error ?? 'dependency check failed') : undefined;
}

function workerOk(workers: Record<string, WorkerEvidence>, workerType: string): boolean {
  return workers[workerType]?.status === 'ok';
}

function workerIssue(
  workers: Record<string, WorkerEvidence>,
  workerType: string
): string | undefined {
  const worker = workers[workerType];
  if (!worker || worker.status === 'unknown') return `${workerType} heartbeat not verified`;
  if (worker.status !== 'ok')
    return `${workerType} ${worker.status}${worker.reason ? `: ${worker.reason}` : ''}`;
  return undefined;
}

function latestTimestamp(
  workers: Record<string, WorkerEvidence>,
  names: string[],
  fallback: string
): string | null {
  const values = names
    .map((name) => workers[name]?.lastHeartbeatAt)
    .filter((value): value is string => Boolean(value));
  if (values.length === 0) return fallback;
  return values.sort().at(-1) ?? fallback;
}

function areaFromGates(input: {
  name: string;
  gates: Gate[];
  link: string;
  lastCheckedAt: string | null;
  errorMeansBlocked?: boolean;
}): F1ClosureArea {
  const passed = input.gates.filter((gate) => gate.ok);
  const failed = input.gates.filter((gate) => !gate.ok);
  const fatal = failed.find((gate) => gate.fatal || gate.error);
  const percent = Math.round((passed.length / input.gates.length) * 100);
  const evidence = passed.map((gate) => gate.label);
  const missing = failed.map((gate) => gate.error ?? gate.missingLabel ?? gate.label);

  let status: AreaStatus;
  if (passed.length === input.gates.length) {
    status = 'ok';
  } else if (fatal && input.errorMeansBlocked !== false) {
    status = 'error';
  } else if (passed.length === 0) {
    status = 'not_verified';
  } else {
    status = 'partial';
  }

  return {
    name: input.name,
    status,
    percent,
    evidence,
    missing,
    lastCheckedAt: input.lastCheckedAt,
    link: input.link,
  };
}

export function calculateF1ClosureStatus(
  evidence: ClosureEvidence,
  generatedAt: string
): F1ClosureStatus {
  const metadata = buildMetadata();
  const dependencyTimestamp = generatedAt;
  const workers = evidence.workers;
  const agentGraphSmokeOk = evidenceFlag('F1_AGENT_GRAPH_SMOKE_OK');
  const runtimeHandoffSmokeOk = evidenceFlag('F1_RUNTIME_HANDOFF_SMOKE_OK');
  const runtimeDbRoleSmokeOk = evidenceFlag('F1_RUNTIME_DB_ROLE_SMOKE_OK');
  const stackVerified = evidenceFlag('F1_STACK_VERIFIED');
  const observabilityTestOk = evidenceFlag('F1_OBSERVABILITY_TEST_OK');
  const tenantIsolationOk = evidenceFlag('F1_TENANT_ISOLATION_OK');
  const internal401Ok = evidenceFlag('F1_INTERNAL_STATUS_401_OK');
  const hardeningOk = evidenceFlag('F1_HARDENING_OK');
  const runtimeDatabaseUrlConfigured = Boolean(process.env['RUNTIME_DATABASE_URL']);
  const deploymentUrl =
    process.env['COOLIFY_URL'] ?? process.env['COOLIFY_FQDN'] ?? process.env['PUBLIC_BASE_URL'];

  const areas: F1ClosureArea[] = [
    areaFromGates({
      name: 'Backend',
      link: endpointUrl('/api/health/live'),
      lastCheckedAt: dependencyTimestamp,
      errorMeansBlocked: false,
      gates: [
        { ok: true, label: '/api/health/live process is serving this page' },
        {
          ok: metadata.phase === 'F1' && Boolean(metadata.version),
          label: '/api/health/version metadata present',
          missingLabel: 'phase/version metadata missing',
        },
        {
          ok: agentGraphSmokeOk,
          label: 'Agent Graph smoke passed',
          missingLabel: 'public Agent Graph smoke not yet passed',
        },
      ],
    }),
    areaFromGates({
      name: 'Runtime Foundation',
      link: endpointUrl('/api/v1/ops/f1/status'),
      lastCheckedAt: latestTimestamp(workers, ['runtime-worker'], dependencyTimestamp),
      errorMeansBlocked: false,
      gates: [
        {
          ok: workerOk(workers, 'runtime-worker'),
          label: 'runtime-worker heartbeat ok',
          missingLabel: workerIssue(workers, 'runtime-worker'),
        },
        {
          ok: runtimeHandoffSmokeOk,
          label: 'runtime handoff smoke returned 202 Accepted',
          missingLabel: 'runtime handoff 202 evidence missing',
        },
        {
          ok: runtimeDatabaseUrlConfigured,
          label: 'RUNTIME_DATABASE_URL configured',
          missingLabel: 'RUNTIME_DATABASE_URL evidence missing',
        },
      ],
    }),
    areaFromGates({
      name: 'Queues',
      link: endpointUrl('/api/health/ready'),
      lastCheckedAt: latestTimestamp(
        workers,
        ['scheduler-worker', 'reclaimer-worker', 'outbox-publisher-worker'],
        dependencyTimestamp
      ),
      gates: [
        {
          ok: checkOk(evidence.dependencies.redis),
          label: 'Redis health ok',
          error: checkError(evidence.dependencies.redis),
          fatal: Boolean(checkError(evidence.dependencies.redis)),
        },
        {
          ok: checkOk(evidence.dependencies.queue),
          label: 'execution.dispatch queue ok',
          error: checkError(evidence.dependencies.queue),
          fatal: Boolean(checkError(evidence.dependencies.queue)),
        },
        {
          ok: workerOk(workers, 'scheduler-worker'),
          label: 'scheduler-worker heartbeat ok',
          missingLabel: workerIssue(workers, 'scheduler-worker'),
        },
        {
          ok: workerOk(workers, 'reclaimer-worker'),
          label: 'reclaimer-worker heartbeat ok',
          missingLabel: workerIssue(workers, 'reclaimer-worker'),
        },
        {
          ok: workerOk(workers, 'outbox-publisher-worker'),
          label: 'outbox-publisher-worker heartbeat ok',
          missingLabel: workerIssue(workers, 'outbox-publisher-worker'),
        },
      ],
    }),
    areaFromGates({
      name: 'DB',
      link: endpointUrl('/api/health/ready'),
      lastCheckedAt: evidence.migrations.lastRunAt ?? dependencyTimestamp,
      gates: [
        {
          ok: checkOk(evidence.dependencies.postgres),
          label: 'Postgres readiness ok',
          error: checkError(evidence.dependencies.postgres),
          fatal: Boolean(checkError(evidence.dependencies.postgres)),
        },
        {
          ok: evidence.migrations.status === 'ok',
          label: `migrations table present${evidence.migrations.lastRunAt ? ` (${evidence.migrations.lastRunAt})` : ''}`,
          missingLabel:
            evidence.migrations.status === 'error'
              ? `migrations status unavailable: ${evidence.migrations.error}`
              : 'migrations status not verified',
        },
        {
          ok: runtimeDbRoleSmokeOk,
          label: 'runtime DB role smoke passed',
          missingLabel: 'runtime DB role smoke evidence missing',
        },
      ],
    }),
    areaFromGates({
      name: 'LLM Integration',
      link: endpointUrl('/api/health/ready'),
      lastCheckedAt: dependencyTimestamp,
      gates: [
        {
          ok: checkOk(evidence.dependencies.litellm),
          label: `LiteLLM readiness ok${evidence.dependencies.litellm.endpoint ? ` (${evidence.dependencies.litellm.endpoint})` : ''}`,
          error: checkError(evidence.dependencies.litellm)
            ? `LiteLLM readiness failed: ${checkError(evidence.dependencies.litellm)}`
            : undefined,
          fatal: Boolean(checkError(evidence.dependencies.litellm)),
        },
      ],
    }),
    areaFromGates({
      name: 'Infra',
      link: endpointUrl('/api/health/version'),
      lastCheckedAt: dependencyTimestamp,
      errorMeansBlocked: false,
      gates: [
        {
          ok: Boolean(metadata.phase && metadata.version && metadata.commit && metadata.builtAt),
          label: 'phase/version/commit/build metadata present',
          missingLabel: 'deployment metadata incomplete',
        },
        {
          ok: Boolean(deploymentUrl),
          label: `deployment URL configured${deploymentUrl ? ` (${deploymentUrl})` : ''}`,
          missingLabel: 'Coolify deployment URL evidence missing',
        },
        { ok: true, label: 'octo-api service health serving root surface' },
        {
          ok: stackVerified,
          label: 'full stack verification passed',
          missingLabel: 'compose/full stack evidence missing',
        },
      ],
    }),
    areaFromGates({
      name: 'Observabilidad',
      link: endpointUrl('/api/v1/ops/f1/status'),
      lastCheckedAt: dependencyTimestamp,
      errorMeansBlocked: false,
      gates: [
        { ok: true, label: 'health/version metadata include timestamps and build identifiers' },
        {
          ok: observabilityTestOk,
          label: 'observability test evidence passed',
          missingLabel: 'traceId/executionId/runId/agentId evidence missing',
        },
      ],
    }),
    areaFromGates({
      name: 'Seguridad',
      link: endpointUrl('/api/v1/ops/f1/status'),
      lastCheckedAt: dependencyTimestamp,
      errorMeansBlocked: false,
      gates: [
        {
          ok: internal401Ok,
          label: '/api/v1/ops/f1/status returns 401 without secret',
          missingLabel: '401 without secret evidence missing',
        },
        {
          ok: tenantIsolationOk,
          label: 'tenant isolation test passed',
          missingLabel: 'tenant isolation evidence missing',
        },
        {
          ok: runtimeDbRoleSmokeOk,
          label: 'runtime DB role smoke passed',
          missingLabel: 'runtime DB role smoke evidence missing',
        },
        {
          ok: hardeningOk,
          label: 'no public token exposure/hardening evidence passed',
          missingLabel: 'hardening/no public token exposure evidence missing',
        },
      ],
    }),
  ];

  const canClaim100 = areas.every((area) => area.status === 'ok');
  const hasError = areas.some((area) => area.status === 'error');
  const verifiedAreas = areas.filter((area) => area.status !== 'not_verified');
  const percent = Math.round(areas.reduce((sum, area) => sum + area.percent, 0) / areas.length);
  const blockingAreas = areas.filter((area) => area.status !== 'ok').map((area) => area.name);
  const overallStatus: OverallStatus = canClaim100
    ? 'operating_100'
    : hasError
      ? 'blocked'
      : verifiedAreas.length === 0
        ? 'not_verified'
        : 'partial';
  const label =
    overallStatus === 'operating_100'
      ? 'OPERANDO 100%'
      : overallStatus === 'blocked'
        ? 'BLOQUEADO'
        : overallStatus === 'not_verified'
          ? 'NO VERIFICADO'
          : 'PARCIAL';

  return {
    overall: {
      status: overallStatus,
      label,
      percent: canClaim100 ? 100 : Math.min(percent, 99),
      canClaim100,
      blockingAreas,
      message: canClaim100
        ? 'F1 operando al 100%.'
        : 'F1 no puede declararse 100% hasta que todas las áreas estén OK.',
    },
    metadata,
    areas,
    generatedAt,
  };
}

function emptyDependencyChecks(error: string): DependencyChecks {
  return {
    redis: { status: 'error', error },
    queue: { status: 'error', error },
    postgres: { status: 'error', error },
    litellm: { status: 'error', error },
  };
}

function getRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { rows?: unknown[] }).rows)
  ) {
    return (result as { rows: any[] }).rows;
  }
  return [];
}

function normalizeWorker(row: any, staleSeconds: number): WorkerEvidence {
  const lastHeartbeat = row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : null;
  const lastHeartbeatAt =
    lastHeartbeat && Number.isFinite(lastHeartbeat.getTime())
      ? lastHeartbeat.toISOString()
      : row.last_heartbeat_at
        ? String(row.last_heartbeat_at)
        : undefined;
  const stale = !lastHeartbeat || Date.now() - lastHeartbeat.getTime() > staleSeconds * 1000;
  const status: WorkerEvidence['status'] = stale
    ? 'degraded'
    : row.status === 'error'
      ? 'error'
      : row.status === 'degraded'
        ? 'degraded'
        : 'ok';
  return {
    status,
    workerType: String(row.worker_type),
    instanceId: row.instance_id ? String(row.instance_id) : undefined,
    lastHeartbeatAt,
    reason: stale ? 'heartbeat_stale' : row.error ? String(row.error) : undefined,
  };
}

@Injectable()
export class PublicF1ClosureStatusService {
  constructor(private readonly healthService: HealthService) {}

  async getStatus(): Promise<F1ClosureStatus> {
    const generatedAt = new Date().toISOString();
    const [dependencies, workerProbe, migrations] = await Promise.all([
      this.collectDependencyChecks(),
      this.collectWorkerEvidence(),
      this.collectMigrationEvidence(),
    ]);

    return calculateF1ClosureStatus(
      {
        dependencies,
        workers: workerProbe.workers,
        workerProbe: workerProbe.error
          ? { status: workerProbe.status, error: workerProbe.error }
          : { status: workerProbe.status },
        migrations,
      },
      generatedAt
    );
  }

  private async collectDependencyChecks(): Promise<DependencyChecks> {
    try {
      return await this.healthService.runChecks();
    } catch (err) {
      return emptyDependencyChecks(err instanceof Error ? err.message : String(err));
    }
  }

  private async collectWorkerEvidence(): Promise<{
    status: 'ok' | 'error';
    workers: Record<string, WorkerEvidence>;
    error?: string | undefined;
  }> {
    const unknownWorkers = Object.fromEntries(
      workerTypes.map((workerType) => [
        workerType,
        { status: 'unknown', workerType, reason: 'no_heartbeat_source' },
      ])
    ) as Record<string, WorkerEvidence>;

    try {
      const configuredStaleSeconds = Number(
        process.env['OPS_WORKER_HEARTBEAT_STALE_SECONDS'] ?? DEFAULT_WORKER_HEARTBEAT_STALE_SECONDS
      );
      const staleSeconds =
        Number.isFinite(configuredStaleSeconds) && configuredStaleSeconds > 0
          ? configuredStaleSeconds
          : DEFAULT_WORKER_HEARTBEAT_STALE_SECONDS;
      const rows = getRows(
        await db.execute(sql`
        SELECT DISTINCT ON (worker_type)
          worker_type,
          instance_id,
          status,
          last_heartbeat_at,
          error
        FROM worker_heartbeats
        WHERE worker_type IN ('runtime-worker', 'scheduler-worker', 'reclaimer-worker', 'outbox-publisher-worker')
        ORDER BY worker_type, last_heartbeat_at DESC
      `)
      );

      for (const row of rows) {
        const worker = normalizeWorker(row, staleSeconds);
        unknownWorkers[worker.workerType] = worker;
      }

      return { status: 'ok', workers: unknownWorkers };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { status: 'error', workers: unknownWorkers, error };
    }
  }

  private async collectMigrationEvidence(): Promise<ClosureEvidence['migrations']> {
    if (evidenceFlag('F1_MIGRATIONS_OK')) {
      return { status: 'ok' };
    }

    try {
      const rows = getRows(
        await db.execute(sql`
        SELECT created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at DESC
        LIMIT 1
      `)
      );
      const last = rows[0]?.created_at;
      return {
        status: rows.length > 0 ? 'ok' : 'missing',
        ...(last ? { lastRunAt: last instanceof Date ? last.toISOString() : String(last) } : {}),
      };
    } catch (err) {
      return { status: 'error', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
