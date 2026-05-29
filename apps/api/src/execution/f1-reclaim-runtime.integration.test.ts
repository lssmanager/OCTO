import { randomUUID } from 'crypto';
import { execFileSync } from 'node:child_process';

import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { agents, agentVersions, db, executionCheckpoints, executions, withTenantTx } from '@octo/database';
import { createQueue, QUEUES } from '@octo/queue';
import { processReclaimCandidate } from '../../../reclaimer-worker/src/reclaim-loop';
import { processExecutionDispatchJob } from '../../../scheduler-worker/src/dispatch-handler';
import { PostgresExecutionRepo } from './postgres-execution.repo';

const runtime = async (executionId: string, tenantId: string) => {
  execFileSync(
    'python',
    [
      '-c',
      `import asyncio; from src.f1_runtime import run_f1_execution; asyncio.run(run_f1_execution("${executionId}","${tenantId}","trace-test","reclaim"))`,
    ],
    { cwd: '../../runtime-worker', env: { ...process.env, OCTO_TEST_LLM_FAKE: 'true' }, stdio: 'inherit' }
  );
};

const hasInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasInfra ? describe : describe.skip;

describeIfInfra('F1 reclaim->dispatch->runtime integration', () => {
  it(
    'replays a reclaimed zombie end-to-end using tenantId from executions.tenantId',
    async () => {
      if (!hasInfra) throw new Error('integration infra missing: set DATABASE_URL and REDIS_URL');

      const tenantId = `tenant-reclaim-${Date.now()}`;
      const agentId = randomUUID();
      const versionId = randomUUID();
      const checkpointId = randomUUID();

      await withTenantTx(tenantId, async (tx) => {
        await tx.insert(agents).values({ id: agentId, tenantId, name: 'a', role: 'r', goal: 'g' });
        await tx.insert(agentVersions).values({
          id: versionId,
          tenantId,
          agentId,
          version: 1,
          configJson: { model: 'fake' },
        });
      });

      const repo = new PostgresExecutionRepo();
      const created = await repo.createExecution({ agentId, agentVersionId: versionId, input: { prompt: 'recover me' } }, tenantId, 'tester');

      await withTenantTx(tenantId, async (tx) => {
        await tx
          .update(executions)
          .set({
            status: 'running',
            state: 'running',
            leaseOwner: 'dead-worker',
            workerId: 'dead-worker',
            leaseExpiresAt: new Date(Date.now() - 60_000),
            updatedAt: new Date(),
          })
          .where(and(eq(executions.id, created.id), eq(executions.tenantId, tenantId)));

        await tx.insert(executionCheckpoints).values({
          id: checkpointId,
          tenantId,
          executionId: created.id,
          stepIndex: 0,
          source: 'input',
          parentCheckpointId: null,
          stateJson: { messages: [{ role: 'user', content: 'recover me' }] },
          metadataJson: { checkpoint_schema_version: 1 },
          workerId: 'dead-worker',
          schemaVersion: 1,
        });
      });

      const queue = createQueue<any>(QUEUES.EXECUTION_DISPATCH, {
        redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
      });

      await processReclaimCandidate(
        db,
        queue,
        {
          id: created.id,
          tenantId,
          agentId,
          status: 'running',
          attempt: 0,
          reclaimCount: 0,
          traceId: 'trace-test',
        },
        3
      );

      const reclaimJob = await queue.getJob(`reclaim:${created.id}:1`);
      expect(reclaimJob).toBeTruthy();
      expect(reclaimJob?.data.tenantId).toBe(tenantId);
      expect(reclaimJob?.data.mode).toBe('reclaim');

      const reclaimable = await repo.getExecutionSummary(created.id, tenantId);
      expect(reclaimable?.status).toBe('reclaimable');
      expect(reclaimable?.state).toBe('reclaimable');

      await processExecutionDispatchJob(reclaimJob!.data, {
        workerId: 'scheduler-reclaim-test',
        leaseSeconds: 90,
        invokeRuntime: async (payload) => {
          expect(payload.mode).toBe('reclaim');
          await runtime(payload.executionId, payload.tenantId);
        },
      });

      const done = await repo.getExecutionSummary(created.id, tenantId);
      expect(done?.status).toBe('completed');
      expect(done?.state).toBe('completed');

      const cps = await withTenantTx(tenantId, (tx) =>
        tx
          .select()
          .from(executionCheckpoints)
          .where(and(eq(executionCheckpoints.executionId, created.id), eq(executionCheckpoints.tenantId, tenantId)))
          .orderBy(asc(executionCheckpoints.stepIndex))
      );
      expect(cps.length).toBeGreaterThanOrEqual(3);
      expect(cps[1]?.source).toBe('reclaim');
      expect(cps[1]?.parentCheckpointId).toBe(checkpointId);

      await queue.close();
    },
    30000
  );
});
