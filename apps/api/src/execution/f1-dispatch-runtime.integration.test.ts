import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { and, asc, eq } from 'drizzle-orm';
import {
  agents,
  agentVersions,
  executionCheckpoints,
  executions,
  withTenantTx,
} from '@octo/database';
import { execFileSync } from 'node:child_process';
import { createQueue, QUEUES } from '@octo/queue';
import { PostgresExecutionRepo } from './postgres-execution.repo';
import { processExecutionDispatchJob } from '../../../scheduler-worker/src/dispatch-handler';

const runtime = async (payload: {
  executionId: string;
  tenantId: string;
  leaseToken: string;
  attempt: number;
  leaseOwner: string;
  mode?: 'normal' | 'reclaim';
}) => {
  execFileSync(
    'python',
    [
      '-c',
      `import asyncio; from src.f1_runtime import run_f1_execution; asyncio.run(run_f1_execution("${payload.executionId}","${payload.tenantId}","trace-test", mode="${payload.mode ?? 'normal'}", lease_token="${payload.leaseToken}", attempt=${payload.attempt}, lease_owner="${payload.leaseOwner}"))`,
    ],
    {
      cwd: '../../runtime-worker',
      env: { ...process.env, OCTO_TEST_LLM_FAKE: 'true' },
      stdio: 'inherit',
    }
  );
};

const hasInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasInfra ? describe : describe.skip;

describeIfInfra('F1 dispatch->runtime integration', () => {
  it('runs queued execution to succeeded with checkpoints and timeline', async () => {
    if (!hasInfra) throw new Error('integration infra missing: set DATABASE_URL and REDIS_URL');
    const tenantA = `tenant-a-${Date.now()}`;
    const tenantB = `tenant-b-${Date.now()}`;
    const agentId = randomUUID();
    const versionId = randomUUID();
    await withTenantTx(tenantA, async (tx) => {
      await tx
        .insert(agents)
        .values({ id: agentId, tenantId: tenantA, name: 'a', role: 'r', goal: 'g' });
      await tx.insert(agentVersions).values({
        id: versionId,
        tenantId: tenantA,
        agentId,
        version: 1,
        configJson: { model: 'fake' },
      });
    });
    const repo = new PostgresExecutionRepo();
    const created = await repo.createExecution(
      { agentId, agentVersionId: versionId, input: { prompt: 'hi' } },
      tenantA,
      'tester'
    );

    const q = createQueue<any>(QUEUES.EXECUTION_DISPATCH, {
      redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
    const waiting = await q.getWaitingCount();
    expect(waiting).toBeGreaterThanOrEqual(1);

    const queued = await repo.getExecutionSummary(created.id, tenantA);
    expect(queued?.status).toBe('queued');
    expect(queued?.state).toBe('queued');
    expect((queued?.contextSnapshotJson as any)?.hierarchySnapshot?.chain).toBeDefined();

    await processExecutionDispatchJob(
      { executionId: created.id, tenantId: tenantA },
      {
        workerId: 'test-worker',
        leaseSeconds: 90,
        invokeRuntime: async (p) => {
          expect(p.agentId).toBe(agentId);
          expect(p.leaseToken).toBeTruthy();
          expect(p.attempt).toBe(1);
          await runtime(p);
        },
      }
    );

    const done = await repo.getExecutionSummary(created.id, tenantA);
    expect(done?.status).toBe('completed');
    expect(done?.state).toBe('completed');
    expect(done?.outputJson).toBeTruthy();

    const cps = await withTenantTx(tenantA, (tx) =>
      tx
        .select()
        .from(executionCheckpoints)
        .where(
          and(
            eq(executionCheckpoints.executionId, created.id),
            eq(executionCheckpoints.tenantId, tenantA)
          )
        )
        .orderBy(asc(executionCheckpoints.stepIndex))
    );
    expect(cps.length).toBeGreaterThanOrEqual(2);
    expect(cps[0]?.parentCheckpointId ?? null).toBe(null);
    expect(cps[cps.length - 1]?.parentCheckpointId).toBe(cps[0]?.id);

    const tl = await repo.getExecutionTimeline(created.id, tenantA);
    const types = tl.map((e: any) => e.eventType);
    expect(types).toEqual(
      expect.arrayContaining([
        'ExecutionQueued',
        'ExecutionDispatched',
        'ExecutionStarted',
        'ExecutionCheckpointed',
        'ExecutionSucceeded',
      ])
    );

    const otherTenantRead = await repo.getExecutionSummary(created.id, tenantB);
    expect(otherTenantRead).toBeNull();

    await processExecutionDispatchJob(
      { executionId: created.id, tenantId: tenantA },
      { workerId: 'test-worker2', leaseSeconds: 90, invokeRuntime: async () => {} }
    );
    const tl2 = await repo.getExecutionTimeline(created.id, tenantA);
    const dispatchedCount = tl2.filter((e: any) => e.eventType === 'ExecutionDispatched').length;
    expect(dispatchedCount).toBe(1);
    await q.close();
  }, 30000);

  it('retries scheduler runtime handoff when HTTP invocation fails or a worker crashes after acceptance', async () => {
    if (!hasInfra) throw new Error('integration infra missing: set DATABASE_URL and REDIS_URL');

    const tenantId = `tenant-dispatch-retry-${Date.now()}`;
    const agentId = randomUUID();
    const versionId = randomUUID();
    await withTenantTx(tenantId, async (tx) => {
      await tx
        .insert(agents)
        .values({ id: agentId, tenantId, name: 'retry-agent', role: 'r', goal: 'g' });
      await tx
        .insert(agentVersions)
        .values({ id: versionId, tenantId, agentId, version: 1, configJson: { model: 'fake' } });
    });

    const repo = new PostgresExecutionRepo();
    const created = await repo.createExecution(
      { agentId, agentVersionId: versionId, input: { prompt: 'retry me' } },
      tenantId,
      'tester'
    );

    await expect(
      processExecutionDispatchJob(
        { executionId: created.id, tenantId },
        {
          workerId: 'retry-worker',
          leaseSeconds: 90,
          invokeRuntime: async () => {
            throw new Error('runtime_unavailable');
          },
        }
      )
    ).rejects.toThrow('runtime_unavailable');

    const dispatched = await repo.getExecutionSummary(created.id, tenantId);
    expect(dispatched?.status).toBe('dispatched');

    let reinvoked = 0;
    await expect(
      processExecutionDispatchJob(
        { executionId: created.id, tenantId },
        {
          workerId: 'retry-worker-2',
          leaseSeconds: 90,
          invokeRuntime: async (payload) => {
            reinvoked += 1;
            expect(payload.agentId).toBe(agentId);
            expect(payload.tenantId).toBe(tenantId);
          },
        }
      )
    ).resolves.toBe('reinvoked');
    expect(reinvoked).toBe(1);

    const timeline = await repo.getExecutionTimeline(created.id, tenantId);
    const dispatchedCount = timeline.filter(
      (e: any) => e.eventType === 'ExecutionDispatched'
    ).length;
    expect(dispatchedCount).toBe(1);
  });

  it('does not invoke runtime again for duplicate dispatch jobs once execution is running', async () => {
    if (!hasInfra) throw new Error('integration infra missing: set DATABASE_URL and REDIS_URL');

    const tenantId = `tenant-dispatch-duplicate-${Date.now()}`;
    const agentId = randomUUID();
    const versionId = randomUUID();
    await withTenantTx(tenantId, async (tx) => {
      await tx
        .insert(agents)
        .values({ id: agentId, tenantId, name: 'duplicate-agent', role: 'r', goal: 'g' });
      await tx
        .insert(agentVersions)
        .values({ id: versionId, tenantId, agentId, version: 1, configJson: { model: 'fake' } });
    });

    const repo = new PostgresExecutionRepo();
    const created = await repo.createExecution(
      { agentId, agentVersionId: versionId, input: { prompt: 'dedupe me' } },
      tenantId,
      'tester'
    );

    await processExecutionDispatchJob(
      { executionId: created.id, tenantId },
      {
        workerId: 'duplicate-worker',
        leaseSeconds: 90,
        invokeRuntime: async (payload) => {
          expect(payload.agentId).toBe(agentId);
        },
      }
    );

    await withTenantTx(tenantId, async (tx) => {
      await tx
        .update(executions)
        .set({ status: 'running', state: 'running' })
        .where(and(eq(executions.id, created.id), eq(executions.tenantId, tenantId)));
    });

    let duplicateInvocations = 0;
    await expect(
      processExecutionDispatchJob(
        { executionId: created.id, tenantId },
        {
          workerId: 'duplicate-worker-2',
          leaseSeconds: 90,
          invokeRuntime: async () => {
            duplicateInvocations += 1;
          },
        }
      )
    ).resolves.toBe('skipped');
    expect(duplicateInvocations).toBe(0);
  });
});
