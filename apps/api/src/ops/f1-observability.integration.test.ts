import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { agentVersions, agents, executionCheckpoints, executions, insertOutboxEvent, withTenantTx } from '@octo/database';
import { PostgresAgentRepo } from '../agents/postgres-agent.repo';
import { AgentPolicyResolverService } from '../agents/agent-policy-resolver.service';
import { PostgresExecutionRepo } from '../execution/postgres-execution.repo';
import { processExecutionDispatchJob } from '../../../scheduler-worker/src/dispatch-handler';
import { OpsV1Service } from './ops-v1.service';

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

function migrationStatements(file: string): string[] {
  return readFileSync(join(migrationsDir, file), 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
}

function rows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as any).rows)) return (result as any).rows;
  return [];
}

describeIfInfra('F1 observability smoke', () => {
  let sql: ReturnType<typeof postgres>;
  const tenantId = `f1-observability-${Date.now()}-${randomUUID()}`;
  const agentId = randomUUID();
  const versionId = randomUUID();
  const traceId = `trace-${randomUUID()}`;
  const correlationId = `corr-${randomUUID()}`;
  let executionId = '';

  beforeAll(async () => {
    sql = postgres(databaseUrl!, { max: 1, idle_timeout: 5, connect_timeout: 5, onnotice: () => undefined });
    for (const file of migrationFiles) for (const statement of migrationStatements(file)) await sql.unsafe(statement);
    await withTenantTx(tenantId, async (tx) => {
      await tx.insert(agents).values({ id: agentId, tenantId, name: 'obs-agent', role: 'tester', goal: 'observable' });
      await tx.insert(agentVersions).values({ id: versionId, tenantId, agentId, version: 1, configJson: { modelPolicy: { primaryModel: 'fake' } } });
    });
  }, 60_000);

  afterAll(async () => {
    if (executionId) {
      await withTenantTx(tenantId, async (tx) => {
        await tx.delete(executionCheckpoints).where(eq(executionCheckpoints.tenantId, tenantId));
        await tx.delete(executions).where(eq(executions.tenantId, tenantId));
        await tx.delete(agentVersions).where(eq(agentVersions.tenantId, tenantId));
        await tx.delete(agents).where(eq(agents.tenantId, tenantId));
      });
    }
    await sql?.end({ timeout: 5 });
  });

  it('reconstructs API -> queue -> scheduler -> runtime-like DB -> outbox by executionId and traceId', async () => {
    const agentRepo = new PostgresAgentRepo();
    const repo = new PostgresExecutionRepo(async () => undefined, new AgentPolicyResolverService(agentRepo));
    const created = await repo.createExecution({ agentId, agentVersionId: versionId, input: { prompt: 'redacted' }, traceId, correlationId }, tenantId, 'operator-test');
    executionId = created.id;

    await processExecutionDispatchJob({ executionId, tenantId, agentId, traceId, correlationId, runId: executionId, queueJobId: executionId }, {
      workerId: 'observability-scheduler',
      leaseSeconds: 90,
      invokeRuntime: async (payload) => {
        await withTenantTx(payload.tenantId, async (tx) => {
          await tx.insert(executionCheckpoints).values({
            id: randomUUID(), tenantId: payload.tenantId, executionId: payload.executionId, stepIndex: 10,
            source: 'runtime-observability-smoke', stateJson: { observable: true }, metadataJson: { traceId: payload.traceId, correlationId: payload.correlationId }, workerId: payload.leaseOwner,
          });
          await tx.update(executions).set({ status: 'completed', state: 'completed', startedAt: new Date(), completedAt: new Date(), updatedAt: new Date(), workerId: payload.leaseOwner }).where(and(eq(executions.id, payload.executionId), eq(executions.tenantId, payload.tenantId)));
          await insertOutboxEvent(tx, { tenantId: payload.tenantId, aggregateType: 'execution', aggregateId: payload.executionId, eventType: 'ExecutionStarted', payloadJson: { executionId: payload.executionId, traceId: payload.traceId, correlationId: payload.correlationId }, traceId: payload.traceId, correlationId: payload.correlationId, runId: payload.runId, source: 'runtime-worker' });
          await insertOutboxEvent(tx, { tenantId: payload.tenantId, aggregateType: 'execution', aggregateId: payload.executionId, eventType: 'ExecutionCheckpointed', payloadJson: { executionId: payload.executionId, traceId: payload.traceId, correlationId: payload.correlationId }, traceId: payload.traceId, correlationId: payload.correlationId, runId: payload.runId, source: 'runtime-worker' });
          await insertOutboxEvent(tx, { tenantId: payload.tenantId, aggregateType: 'execution', aggregateId: payload.executionId, eventType: 'ExecutionSucceeded', payloadJson: { executionId: payload.executionId, traceId: payload.traceId, correlationId: payload.correlationId }, traceId: payload.traceId, correlationId: payload.correlationId, runId: payload.runId, source: 'runtime-worker' });
        });
      },
    });

    const timeline = await repo.getExecutionTimeline(executionId, tenantId);
    expect(timeline.map((event: any) => event.eventType)).toEqual(expect.arrayContaining(['ExecutionQueued', 'ExecutionDispatched', 'ExecutionStarted', 'ExecutionCheckpointed', 'ExecutionSucceeded']));
    expect(timeline.every((event: any) => (event.payloadJson as any)._meta?.traceId === traceId)).toBe(true);
    expect(timeline.every((event: any) => (event.payloadJson as any)._meta?.correlationId === correlationId)).toBe(true);

    const ops = new OpsV1Service({
      listDlq: async () => ({}), requeue: async () => ({}), discard: async () => undefined, metrics: async () => ({}), stale: async () => ({}), reset: async () => ({}), f1Status: async () => ({}),
      observeExecution: async (_tenantId, id) => ({ execution: await repo.getExecutionSummary(id, _tenantId), timeline: await repo.getExecutionTimeline(id, _tenantId), outbox: await repo.getExecutionTimeline(id, _tenantId), dlq: [] }),
      observeTrace: async (_tenantId, tid) => ({ traceId: tid, executions: rows(await sql`SELECT id, trace_id FROM executions WHERE tenant_id=${_tenantId} AND trace_id=${tid}`), timeline: await repo.getExecutionTimeline(executionId, _tenantId) }),
    } as any);
    const byExecution = await ops.observeExecution(tenantId, executionId);
    expect(byExecution.execution).toMatchObject({ id: executionId, traceId });
    expect(byExecution.timeline.length).toBeGreaterThanOrEqual(5);
    const byTrace = await ops.observeTrace(tenantId, traceId);
    expect(byTrace.executions.map((row: any) => row.id)).toContain(executionId);
  });
});
