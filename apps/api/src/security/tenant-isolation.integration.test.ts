import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { and, asc, eq } from 'drizzle-orm';
import {
  agentVersions,
  agents,
  approvals,
  db,
  executionCheckpointWrites,
  executionCheckpoints,
  executionDlq,
  executions,
  executionSteps,
  idempotencyKeys,
  insertOutboxEvent,
  outboxEvents,
  toolInvocations,
  withTenantTx,
} from '@octo/database';
import { createQueue, QUEUES } from '@octo/queue';
import { AgentService } from '../agents/agent.service';
import { PostgresAgentRepo } from '../agents/postgres-agent.repo';
import { AgentPolicyResolverService } from '../agents/agent-policy-resolver.service';
import { ExecutionControllerService } from '../execution/execution-controller.service';
import { PostgresExecutionRepo, type DispatchEnqueuePayload } from '../execution/postgres-execution.repo';
import { processExecutionDispatchJob } from '../../../scheduler-worker/src/dispatch-handler';
import { processReclaimCandidate } from '../../../reclaimer-worker/src/reclaim-loop';

const databaseUrl = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'];
const describeIfInfra = databaseUrl && redisUrl ? describe : describe.skip;

const migrationsDir = join(process.cwd(), 'packages', 'database', 'migrations');
const migrationFiles = [
  '0000_pale_switch.sql',
  '202605230001_f1_executions_core.sql',
  '202605230002_f1_tools_approvals_outbox.sql',
  '202605230003_f1_rls_policies.sql',
  '202605230004_f1_rls_hardening.sql',
  '202605280001_canonical_execution_status.sql',
  '202605280002_worker_heartbeats.sql',
  '202605300001_f1_tool_invocation_governance.sql',
  '202605300003_f1_lease_token_reclaim_dlq.sql',
  '202606010001_f1_tenant_isolation_rls_expansion.sql',
];

type Fixture = {
  tenantId: string;
  userId: string;
  agentId: string;
  versionId: string;
  executionId: string;
  stepId: string;
  checkpointId: string;
  checkpointWriteId: string;
  dlqId: string;
  toolInvocationId: string;
  approvalId: string;
  idempotencyId: string;
  traceId: string;
  runId: string;
};

function readMigrationStatements(file: string): string[] {
  return readFileSync(join(migrationsDir, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function b64url(value: unknown): string {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function signTenantJwt(input: { subject: string; tenantId: string; scopes?: string[]; roles?: string[] }): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET is required for tenant isolation tests');
  const header = { alg: 'HS256', kid: 'tenant-isolation-test' };
  const payload = {
    sub: input.subject,
    tenant_id: input.tenantId,
    roles: input.roles ?? ['developer'],
    scopes: input.scopes ?? ['agents:read', 'agents:write', 'executions:read', 'executions:write', 'ops:read', 'ops:write'],
    iss: 'octo-api',
    aud: 'octo-e2e',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: randomUUID(),
  };
  const data = `${b64url(header)}.${b64url(payload)}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

async function cleanupTenant(tenantId: string) {
  await withTenantTx(tenantId, async (tx) => {
    await tx.delete(toolInvocations).where(eq(toolInvocations.tenantId, tenantId));
    await tx.delete(approvals).where(eq(approvals.tenantId, tenantId));
    await tx.delete(executionCheckpointWrites).where(eq(executionCheckpointWrites.tenantId, tenantId));
    await tx.delete(executionCheckpoints).where(eq(executionCheckpoints.tenantId, tenantId));
    await tx.delete(executionSteps).where(eq(executionSteps.tenantId, tenantId));
    await tx.delete(executionDlq).where(eq(executionDlq.tenantId, tenantId));
    await tx.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
    await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.tenantId, tenantId));
    await tx.delete(executions).where(eq(executions.tenantId, tenantId));
    await tx.delete(agentVersions).where(eq(agentVersions.tenantId, tenantId));
    await tx.delete(agents).where(eq(agents.tenantId, tenantId));
  });
}

async function createFixture(tenantId: string, label: string): Promise<Fixture> {
  const fixture: Fixture = {
    tenantId,
    userId: `user-${label}-${randomUUID()}`,
    agentId: `agent-${label}-${randomUUID()}`,
    versionId: `agent-version-${label}-${randomUUID()}`,
    executionId: `execution-${label}-${randomUUID()}`,
    stepId: `step-${label}-${randomUUID()}`,
    checkpointId: `checkpoint-${label}-${randomUUID()}`,
    checkpointWriteId: `checkpoint-write-${label}-${randomUUID()}`,
    dlqId: `dlq-${label}-${randomUUID()}`,
    toolInvocationId: `tool-${label}-${randomUUID()}`,
    approvalId: `approval-${label}-${randomUUID()}`,
    idempotencyId: `idempotency-${label}-${randomUUID()}`,
    traceId: `trace-${label}-${randomUUID()}`,
    runId: `run-${label}-${randomUUID()}`,
  };

  await withTenantTx(tenantId, async (tx) => {
    await tx.insert(agents).values({
      id: fixture.agentId,
      tenantId,
      name: `Tenant ${label} Agent`,
      description: 'tenant isolation fixture',
      role: 'tester',
      goal: 'prove isolation',
      metadata: { fixture: true, label },
    });
    await tx.insert(agentVersions).values({
      id: fixture.versionId,
      tenantId,
      agentId: fixture.agentId,
      version: 1,
      configJson: { instructions: `tenant ${label}`, modelPolicy: { primaryModel: 'fake' } },
    });
    await tx.insert(executions).values({
      id: fixture.executionId,
      tenantId,
      agentId: fixture.agentId,
      agentVersionId: fixture.versionId,
      state: 'running',
      status: 'running',
      inputJson: { tenant: tenantId },
      task: { tenant: tenantId },
      createdBy: fixture.userId,
      traceId: fixture.traceId,
      runId: fixture.runId,
      leaseOwner: 'runtime-fixture',
      leaseToken: `lease-${label}`,
      leaseExpiresAt: new Date(Date.now() - 60_000),
    });
    await tx.insert(executionSteps).values({
      id: fixture.stepId,
      tenantId,
      executionId: fixture.executionId,
      stepIndex: 1,
      stepType: 'reasoning',
      status: 'running',
    });
    await tx.insert(executionCheckpoints).values({
      id: fixture.checkpointId,
      tenantId,
      executionId: fixture.executionId,
      stepIndex: 1,
      source: 'runtime',
      stateJson: { tenant: tenantId },
      metadataJson: { fixture: true },
    });
    await tx.insert(executionCheckpointWrites).values({
      id: fixture.checkpointWriteId,
      tenantId,
      checkpointId: fixture.checkpointId,
      taskId: fixture.executionId,
      writeIndex: 0,
      channel: 'messages',
      valueJson: { tenant: tenantId },
    });
    await tx.insert(approvals).values({
      id: fixture.approvalId,
      tenantId,
      executionId: fixture.executionId,
      stepId: fixture.stepId,
      kind: 'tool',
      status: 'pending',
      title: 'approval',
      reason: 'fixture',
      payloadJson: { tenant: tenantId },
    });
    await tx.insert(toolInvocations).values({
      id: fixture.toolInvocationId,
      tenantId,
      executionId: fixture.executionId,
      stepId: fixture.stepId,
      toolName: 'fixture.echo',
      toolKind: 'builtin',
      status: 'running',
      argsJson: { tenant: tenantId },
      idempotencyKey: `tool:${fixture.executionId}`,
    });
    await tx.insert(executionDlq).values({
      id: fixture.dlqId,
      executionId: fixture.executionId,
      tenantId,
      reason: 'manual',
      attemptsMade: 1,
      lastError: { code: 'FIXTURE', message: 'fixture', retryable: false },
      failureContext: { tenantId, executionId: fixture.executionId },
      queueName: QUEUES.EXECUTION_DISPATCH,
      queueJobId: fixture.executionId,
      traceId: fixture.traceId,
      runId: fixture.runId,
      payloadJson: { tenantId, executionId: fixture.executionId },
    });
    await tx.insert(idempotencyKeys).values({
      id: fixture.idempotencyId,
      tenantId,
      scope: 'execution',
      key: `shared-key-${label}`,
      status: 'success',
      entityId: fixture.executionId,
      result: { executionId: fixture.executionId },
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await insertOutboxEvent(tx, {
      tenantId,
      aggregateType: 'execution',
      aggregateId: fixture.executionId,
      eventType: 'ExecutionStarted',
      payloadJson: { executionId: fixture.executionId, tenantId: `contradictory-${tenantId}` },
      traceId: fixture.traceId,
      source: 'runtime-worker',
    });
  });

  return fixture;
}

describeIfInfra('F1 tenant isolation end-to-end invariant', () => {
  let sql: ReturnType<typeof postgres>;
  let tenantA: Fixture;
  let tenantB: Fixture;
  const dispatched: DispatchEnqueuePayload[] = [];
  let executionService: ExecutionControllerService;
  let agentService: AgentService;

  beforeAll(async () => {
    process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'tenant-isolation-test-secret';
    process.env['JWT_SIGNING_KEYS'] = process.env['JWT_SIGNING_KEYS'] ?? JSON.stringify([
      { kid: 'tenant-isolation-test', algorithm: 'HS256', isActive: true, secret: process.env['JWT_SECRET'] },
    ]);

    sql = postgres(databaseUrl!, { max: 1, idle_timeout: 5, connect_timeout: 5, onnotice: () => undefined });
    for (const file of migrationFiles) {
      for (const statement of readMigrationStatements(file)) await sql.unsafe(statement);
    }

    const runId = `f1-tenant-isolation-${Date.now()}-${randomUUID()}`;
    tenantA = await createFixture(`${runId}-tenant-a`, 'a');
    tenantB = await createFixture(`${runId}-tenant-b`, 'b');

    const agentRepo = new PostgresAgentRepo();
    agentService = new AgentService(agentRepo, new AgentPolicyResolverService(agentRepo));
    executionService = new ExecutionControllerService(
      new PostgresExecutionRepo(async (payload) => { dispatched.push(payload); }, new AgentPolicyResolverService(agentRepo))
    );
  }, 60_000);

  afterAll(async () => {
    if (tenantA) await cleanupTenant(tenantA.tenantId);
    if (tenantB) await cleanupTenant(tenantB.tenantId);
    await sql?.end({ timeout: 5 });
  });

  it('generates real tenant JWTs from env without hardcoded token material', () => {
    const tokenA = signTenantJwt({ subject: tenantA.userId, tenantId: tenantA.tenantId });
    const tokenB = signTenantJwt({ subject: tenantB.userId, tenantId: tenantB.tenantId });
    expect(tokenA).not.toBe(tokenB);
    expect(JSON.parse(Buffer.from(tokenA.split('.')[1]!, 'base64url').toString()).tenant_id).toBe(tenantA.tenantId);
    expect(JSON.parse(Buffer.from(tokenB.split('.')[1]!, 'base64url').toString()).tenant_id).toBe(tenantB.tenantId);
    expect(tokenA).not.toContain(process.env['JWT_SECRET']!);
  });

  it('isolates Agents API service reads and cross-tenant parent references', async () => {
    const aList = await agentService.list(tenantA.tenantId, 50);
    expect(aList.map((row) => row.id)).toContain(tenantA.agentId);
    expect(aList.map((row) => row.id)).not.toContain(tenantB.agentId);
    await expect(agentService.get(tenantA.tenantId, tenantB.agentId)).rejects.toThrow(/agent_not_found/i);
    await expect(agentService.versions(tenantA.tenantId, tenantB.agentId, 10)).rejects.toThrow(/agent_not_found/i);
    await expect(agentService.create(tenantA.tenantId, tenantA.userId, {
      name: 'cross-tenant-child', role: 'tester', goal: 'should fail', parentId: tenantB.agentId,
    })).rejects.toThrow(/invalid_hierarchy_parent|agent_not_found/i);
  });

  it('isolates Executions API create/read/timeline/cancel/resume and reverse access', async () => {
    await expect(executionService.create({
      agentId: tenantB.agentId,
      agentVersionId: tenantB.versionId,
      input: { prompt: 'cross tenant' },
    }, tenantA.tenantId, tenantA.userId)).rejects.toThrow(/agent_version_not_found|agent_not_found/i);
    await expect(executionService.create({
      agentId: tenantA.agentId,
      agentVersionId: tenantB.versionId,
      input: { prompt: 'cross tenant version' },
    }, tenantA.tenantId, tenantA.userId)).rejects.toThrow(/agent_version_not_found|agent_not_found/i);

    await expect(executionService.getSummary(tenantB.executionId, tenantA.tenantId)).rejects.toThrow(/execution_not_found/i);
    await expect(executionService.getSummary(tenantA.executionId, tenantB.tenantId)).rejects.toThrow(/execution_not_found/i);
    expect(await executionService.getTimeline(tenantB.executionId, tenantA.tenantId)).toEqual([]);
    expect(await executionService.cancel(tenantB.executionId, tenantA.tenantId)).toEqual({ accepted: false });
    expect(await executionService.resume(tenantB.executionId, tenantA.tenantId)).toEqual({ accepted: false });

    const created = await executionService.create({
      agentId: tenantA.agentId,
      agentVersionId: tenantA.versionId,
      input: { prompt: 'ok' },
    }, tenantA.tenantId, tenantA.userId);
    expect(dispatched.at(-1)).toEqual(expect.objectContaining({ executionId: created.id, tenantId: tenantA.tenantId, agentId: tenantA.agentId }));
    await expect(executionService.getSummary(created.id, tenantB.tenantId)).rejects.toThrow(/execution_not_found/i);
  });

  it('isolates Ops/DLQ/stale data and rejects cross-tenant reclaim/requeue payloads', async () => {
    const dlqA = await db.select().from(executionDlq).where(eq(executionDlq.tenantId, tenantA.tenantId));
    expect(dlqA.map((row) => row.id)).toContain(tenantA.dlqId);
    expect(dlqA.map((row) => row.id)).not.toContain(tenantB.dlqId);

    const queue = createQueue<any>(QUEUES.EXECUTION_DISPATCH, { redisUrl: redisUrl! });
    try {
      const mismatched = await processReclaimCandidate(db, queue, {
        id: tenantB.executionId,
        tenantId: tenantA.tenantId,
        agentId: tenantB.agentId,
        status: 'reclaimable',
        attempt: 0,
        reclaimCount: 0,
        traceId: tenantB.traceId,
        runId: tenantB.runId,
        leaseToken: null,
        queueJobId: null,
      }, 3);
      expect(mismatched).toBe('skipped');
      expect(await queue.getJob(`reclaim:${tenantB.executionId}:1`)).toBeNull();
    } finally {
      await queue.close();
    }
  });

  it('isolates outbox/timeline by tenant_id column even when payload tenant is contradictory', async () => {
    const timelineA = await executionService.getTimeline(tenantA.executionId, tenantA.tenantId);
    expect(timelineA.map((event) => event.tenantId)).toEqual(timelineA.map(() => tenantA.tenantId));
    expect(timelineA.map((event) => event.id)).not.toContain(tenantB.executionId);

    const poisonedPayloadEvent = timelineA.find((event) => event.eventType === 'ExecutionStarted');
    expect((poisonedPayloadEvent?.payloadJson as any)?.tenantId).toBe(`contradictory-${tenantA.tenantId}`);
    const bEvents = await db.select().from(outboxEvents).where(eq(outboxEvents.tenantId, tenantB.tenantId));
    expect(timelineA.map((event) => event.id)).not.toEqual(expect.arrayContaining(bEvents.map((event) => event.id)));
  });

  it('validates PostgreSQL RLS directly on all F1 tenant-scoped runtime tables', async () => {
    const tables = [
      'agents', 'agent_versions', 'executions', 'execution_steps', 'execution_checkpoints',
      'execution_checkpoint_writes', 'execution_dlq', 'outbox_events', 'tool_invocations',
      'approvals', 'idempotency_keys',
    ];
    const rls = await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${tables})
    `;
    expect(rls).toHaveLength(tables.length);
    for (const row of rls) {
      expect(row.relrowsecurity, `${row.relname} must enable RLS`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} must force RLS`).toBe(true);
    }

    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', ${tenantA.tenantId}, true)`;
      for (const table of tables) {
        const rows = await tx.unsafe(`SELECT tenant_id FROM "${table}" WHERE tenant_id <> $1 LIMIT 1`, [tenantA.tenantId]);
        expect(rows, `${table} leaked another tenant under tenant A`).toHaveLength(0);
      }
    });
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', ${tenantB.tenantId}, true)`;
      for (const table of tables) {
        const rows = await tx.unsafe(`SELECT tenant_id FROM "${table}" WHERE tenant_id <> $1 LIMIT 1`, [tenantB.tenantId]);
        expect(rows, `${table} leaked another tenant under tenant B`).toHaveLength(0);
      }
    });
  });

  it('rejects scheduler payloads without tenant or with tenant/agent mismatch', async () => {
    await expect(processExecutionDispatchJob({ executionId: tenantA.executionId, tenantId: '' }, {
      workerId: 'tenant-isolation-scheduler', leaseSeconds: 30, invokeRuntime: async () => undefined,
    })).rejects.toThrow(/invalid_dispatch_payload/);

    await expect(processExecutionDispatchJob({ executionId: tenantA.executionId, tenantId: tenantA.tenantId, agentId: tenantB.agentId }, {
      workerId: 'tenant-isolation-scheduler', leaseSeconds: 30, invokeRuntime: async () => undefined,
    })).rejects.toThrow(/dispatch_tenant_agent_mismatch/);
  });

  it('preserves tenantId through scheduler runtime handoff and durable runtime-like writes', async () => {
    await withTenantTx(tenantA.tenantId, async (tx) => {
      await tx.update(executions).set({ status: 'queued', state: 'queued' }).where(and(eq(executions.id, tenantA.executionId), eq(executions.tenantId, tenantA.tenantId)));
    });
    const seen: any[] = [];
    await processExecutionDispatchJob({ executionId: tenantA.executionId, tenantId: tenantA.tenantId, agentId: tenantA.agentId }, {
      workerId: 'tenant-isolation-scheduler',
      leaseSeconds: 30,
      invokeRuntime: async (payload) => {
        seen.push(payload);
        await withTenantTx(payload.tenantId, async (tx) => {
          const [current] = await tx.select().from(executions).where(and(eq(executions.id, payload.executionId), eq(executions.tenantId, payload.tenantId))).limit(1);
          expect(current?.tenantId).toBe(tenantA.tenantId);
          await tx.insert(executionCheckpoints).values({
            id: randomUUID(), tenantId: payload.tenantId, executionId: payload.executionId, stepIndex: 99,
            source: 'runtime-tenant-isolation', stateJson: { tenantId: payload.tenantId }, metadataJson: {}, workerId: payload.leaseOwner,
          });
          await insertOutboxEvent(tx, {
            tenantId: payload.tenantId, aggregateType: 'execution', aggregateId: payload.executionId,
            eventType: 'ExecutionCheckpointed', payloadJson: { executionId: payload.executionId, tenantId: payload.tenantId },
            traceId: payload.traceId, source: 'runtime-worker',
          });
        });
      },
    });
    expect(seen[0]).toEqual(expect.objectContaining({ tenantId: tenantA.tenantId, executionId: tenantA.executionId, agentId: tenantA.agentId }));
    const leakedCheckpoint = await withTenantTx(tenantB.tenantId, (tx) => tx.select().from(executionCheckpoints).where(and(eq(executionCheckpoints.executionId, tenantA.executionId), eq(executionCheckpoints.tenantId, tenantB.tenantId))).orderBy(asc(executionCheckpoints.createdAt)));
    expect(leakedCheckpoint).toEqual([]);
  });
});
