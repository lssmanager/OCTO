import { randomUUID } from 'crypto';

import { and, eq, lt } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { agents, agentVersions, db, executions, withTenantTx } from '@octo/database';
import { createQueue, QUEUES } from '@octo/queue';
import { reconcileQueuedDispatchGaps } from '../../../scheduler-worker/src/reconciliation/execution-reconciler';
import { PostgresExecutionRepo } from './postgres-execution.repo';

const hasInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasInfra ? describe : describe.skip;

describeIfInfra('F1 queued dispatch reconciliation', () => {
  it('repairs a queued execution when enqueue fails after the DB commit', async () => {
    if (!hasInfra) throw new Error('integration infra missing: set DATABASE_URL and REDIS_URL');

    const tenantId = `tenant-dispatch-gap-${Date.now()}`;
    const agentId = randomUUID();
    const versionId = randomUUID();
    const queue = createQueue(QUEUES.EXECUTION_DISPATCH, {
      redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    });

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

    const repo = new PostgresExecutionRepo(async () => {
      throw new Error('redis_unavailable_after_commit');
    });

    const created = await repo.createExecution(
      {
        agentId,
        agentVersionId: versionId,
        input: { prompt: 'repair me' },
      },
      tenantId,
      'tester'
    );

    try {
      expect(await queue.getJob(created.id)).toBeNull();

      const execution = await repo.getExecutionSummary(created.id, tenantId);
      expect(execution?.status).toBe('queued');
      expect(execution?.state).toBe('queued');
      expect(execution?.queueJobId).toBe(created.id);
      expect(execution?.traceId).toBeTruthy();

      const timeline = await repo.getExecutionTimeline(created.id, tenantId);
      expect(timeline.some((event) => event.eventType === 'ExecutionDispatchDeferred')).toBe(true);

      const deps = {
        findQueuedDispatchGaps: async (staleBefore: Date, batchSize: number) => {
          return db
            .select({
              id: executions.id,
              tenantId: executions.tenantId,
              agentId: executions.agentId,
              traceId: executions.traceId,
              queueJobId: executions.queueJobId,
              createdAt: executions.createdAt,
              updatedAt: executions.updatedAt,
            })
            .from(executions)
            .where(
              and(
                eq(executions.tenantId, tenantId),
                eq(executions.status, 'queued'),
                lt(executions.updatedAt, staleBefore)
              )
            )
            .limit(batchSize);
        },
        ensureDispatchJob: async (gap: {
          id: string;
          tenantId: string;
          agentId: string;
          traceId: string;
          queueJobId: string | null;
        }) => {
          const jobId = gap.queueJobId ?? gap.id;
          const existing = await queue.getJob(jobId);
          if (existing) return 'already_present' as const;
          await queue.add(
            'dispatch',
            {
              executionId: gap.id,
              tenantId: gap.tenantId,
              agentId: gap.agentId,
              traceId: gap.traceId,
              expectedState: 'queued',
            },
            { jobId }
          );
          return 'enqueued' as const;
        },
      };

      const firstPass = await reconcileQueuedDispatchGaps(deps, {
        staleMs: 0,
        batchSize: 10,
      });
      expect(firstPass.staleQueuedCount).toBe(1);
      expect(firstPass.repaired).toBe(1);
      expect(firstPass.oldestStaleQueuedAgeMs).not.toBeNull();

      const repairedJob = await queue.getJob(created.id);
      expect(repairedJob).not.toBeNull();
      expect(repairedJob?.data).toMatchObject({
        executionId: created.id,
        tenantId,
        agentId,
        expectedState: 'queued',
      });

      const secondPass = await reconcileQueuedDispatchGaps(deps, {
        staleMs: 0,
        batchSize: 10,
      });
      expect(secondPass.staleQueuedCount).toBe(1);
      expect(secondPass.repaired).toBe(0);
      expect(secondPass.alreadyPresent).toBe(1);
    } finally {
      const job = await queue.getJob(created.id);
      if (job) {
        await job.remove();
      }
      await queue.close();
    }
  });
});
