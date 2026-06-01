import { and, asc, eq, sql } from 'drizzle-orm';
import { agentVersions, executions, outboxEvents, withTenantTx, insertOutboxEvent } from '@octo/database';
import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { createQueue, QUEUES } from '@octo/queue';
import { AgentPolicyResolverService } from '../agents/agent-policy-resolver.service';
import { PostgresAgentRepo } from '../agents/postgres-agent.repo';

export type DispatchEnqueuePayload = {
  executionId: string;
  tenantId: string;
  agentId: string;
  traceId: string;
  correlationId: string;
  runId: string;
  queueJobId: string;
  expectedState: 'queued';
};

export type DispatchEnqueuer = (payload: DispatchEnqueuePayload, jobId: string) => Promise<void>;

async function enqueueExecutionDispatch(payload: DispatchEnqueuePayload, jobId: string): Promise<void> {
  const queue = createQueue<DispatchEnqueuePayload>(QUEUES.EXECUTION_DISPATCH, {
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  });

  try {
    await queue.add('dispatch', payload, { jobId });
  } finally {
    await queue.close();
  }
}

export class PostgresExecutionRepo {
  constructor(
    private readonly dispatchEnqueuer: DispatchEnqueuer = enqueueExecutionDispatch,
    private readonly policyResolver: AgentPolicyResolverService = new AgentPolicyResolverService(new PostgresAgentRepo())
  ) {}

  async createExecution(input: any, tenantId: string, createdBy: string): Promise<{ id: string }> {
    const id = randomUUID();
    const traceId = typeof input.traceId === 'string' && input.traceId.length > 0 ? input.traceId : randomUUID();
    const runId = typeof input.runId === 'string' && input.runId.length > 0 ? input.runId : id;
    const correlationId = typeof input.correlationId === 'string' && input.correlationId.length > 0 ? input.correlationId : traceId;
    const version = await withTenantTx(tenantId, async (tx) => {
      return (
        await tx
          .select({ id: agentVersions.id })
          .from(agentVersions)
          .where(
            and(
              eq(agentVersions.tenantId, tenantId),
              eq(agentVersions.agentId, input.agentId),
              eq(agentVersions.id, input.agentVersionId)
            )
          )
          .limit(1)
      )[0];
    });
    if (!version) throw new NotFoundException('agent_version_not_found');

    const contextSnapshot = await this.policyResolver.resolveEffectivePolicies(tenantId, input.agentId);

    await withTenantTx(tenantId, async (tx) => {
      await tx.insert(executions).values({
        id,
        tenantId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        status: 'queued',
        state: 'queued',
        queueJobId: id,
        traceId,
        runId,
        createdBy,
        inputJson: input.input ?? {},
        task: input.input ?? {},
        contextSnapshotJson: contextSnapshot,
        budgetSnapshotJson: contextSnapshot.budgetPolicy ?? {},
        governance: contextSnapshot.governance ?? {},
      });
      await insertOutboxEvent(tx, {
        tenantId,
        aggregateType: 'execution',
        aggregateId: id,
        eventType: 'ExecutionQueued',
        payloadJson: { executionId: id, queueJobId: id, traceId, correlationId, runId },
        traceId,
        correlationId,
        runId,
        source: 'api',
      });
    });

    try {
      await this.dispatchEnqueuer(
        {
          executionId: id,
          tenantId,
          agentId: input.agentId,
          traceId,
          correlationId,
          runId,
          queueJobId: id,
          expectedState: 'queued',
        },
        id
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        msg: 'execution_dispatch_enqueue_deferred',
        executionId: id,
        tenantId,
        agentId: input.agentId,
        traceId,
        correlationId,
        runId,
        queueJobId: id,
        error: errorMessage,
      }));

      try {
        await withTenantTx(tenantId, async (tx) => {
          await insertOutboxEvent(tx, {
            tenantId,
            aggregateType: 'execution',
            aggregateId: id,
            eventType: 'ExecutionDispatchDeferred',
            payloadJson: {
              executionId: id,
              queueJobId: id,
              errorCode: 'DISPATCH_ENQUEUE_DEFERRED',
              errorMessage,
              traceId,
              correlationId,
              runId,
            },
            traceId,
            correlationId,
            runId,
            source: 'api',
          });
        });
      } catch (eventError) {
        console.error('execution_dispatch_deferred_event_failed', {
          executionId: id,
          tenantId,
          error: eventError instanceof Error ? eventError.message : String(eventError),
        });
      }
    }

    return { id };
  }
  async getExecutionSummary(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.select().from(executions).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId))).limit(1))[0] ?? null); }
  getExecutionTimeline(executionId: string, tenantId: string) { return withTenantTx(tenantId, (tx) => tx.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, executionId), eq(outboxEvents.tenantId, tenantId))).orderBy(asc(outboxEvents.sequence), asc(outboxEvents.createdAt))); }
  casRequestCancellation(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.update(executions).set({ cancellationRequestedAt: new Date(), status: 'cancelled', state: 'cancelled' }).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId), sql`${executions.status} NOT IN ('completed','failed','cancelled')`)).returning({ id: executions.id })).length > 0); }
  casResumeSuspended(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.update(executions).set({ status: 'queued', state: 'queued' }).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId), eq(executions.status, 'suspended'))).returning({ id: executions.id })).length > 0); }
  createOutboxEntry(executionId: string, tenantId: string, command: 'cancel'|'resume') { return withTenantTx(tenantId, async (tx) => {
    const [current] = await tx.select({ traceId: executions.traceId, runId: executions.runId }).from(executions).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId))).limit(1);
    await insertOutboxEvent(tx, { tenantId, aggregateType: 'execution', aggregateId: executionId, eventType: command === 'cancel' ? 'ExecutionCancellationRequested' : 'ExecutionResumeRequested', payloadJson: { executionId, command, traceId: current?.traceId, correlationId: current?.traceId, runId: current?.runId }, traceId: current?.traceId ?? null, correlationId: current?.traceId ?? null, runId: current?.runId ?? null, source: 'api' });
  }); }
}
