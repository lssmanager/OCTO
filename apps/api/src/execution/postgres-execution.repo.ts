import { and, asc, eq, sql } from 'drizzle-orm';
import { executions, outboxEvents, withTenantTx, insertOutboxEvent } from '@octo/database';
import { randomUUID } from 'crypto';
import { createQueue, QUEUES } from '@octo/queue';
import { AgentPolicyResolverService } from '../agents/agent-policy-resolver.service';
import { PostgresAgentRepo } from '../agents/postgres-agent.repo';

export class PostgresExecutionRepo {
  private readonly policyResolver = new AgentPolicyResolverService(new PostgresAgentRepo());

  async createExecution(input: any, tenantId: string, createdBy: string): Promise<{ id: string }> {
    const id = randomUUID();
    const traceId = input.traceId ?? randomUUID();
    const contextSnapshot = await this.policyResolver.resolveEffectivePolicies(tenantId, input.agentId);
    await withTenantTx(tenantId, async (tx) => {
      await tx.insert(executions).values({
        id,
        tenantId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        status: 'queued',
        state: 'queued',
        createdBy,
        inputJson: input.input ?? {},
        task: input.input ?? {},
        contextSnapshotJson: contextSnapshot,
        budgetSnapshotJson: contextSnapshot.budgetPolicy ?? {},
        governance: contextSnapshot.governance ?? {},
      });
      await insertOutboxEvent(tx, { tenantId, aggregateType: 'execution', aggregateId: id, eventType: 'ExecutionQueued', payloadJson: { executionId: id }, traceId, source: 'api' });
    });
    const queue = createQueue<any>(QUEUES.EXECUTION_DISPATCH, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
    try {
      await queue.add('dispatch', { executionId: id, tenantId, agentId: input.agentId, traceId, expectedState: 'queued' }, { jobId: id });
    } catch (error) {
      await withTenantTx(tenantId, async (tx) => {
        await tx.update(executions).set({ status: 'failed', state: 'failed', errorCode: 'DISPATCH_ENQUEUE_FAILED', errorMessage: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(and(eq(executions.id, id), eq(executions.tenantId, tenantId), eq(executions.status, 'queued')));
        await insertOutboxEvent(tx, { tenantId, aggregateType: 'execution', aggregateId: id, eventType: 'ExecutionFailed', payloadJson: { executionId: id, errorCode: 'DISPATCH_ENQUEUE_FAILED' }, traceId, source: 'api' });
      });
      throw error;
    } finally {
      await queue.close();
    }
    return { id };
  }
  async getExecutionSummary(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.select().from(executions).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId))).limit(1))[0] ?? null); }
  getExecutionTimeline(executionId: string, tenantId: string) { return withTenantTx(tenantId, (tx) => tx.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, executionId), eq(outboxEvents.tenantId, tenantId))).orderBy(asc(outboxEvents.sequence), asc(outboxEvents.createdAt))); }
  casRequestCancellation(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.update(executions).set({ cancellationRequestedAt: new Date(), status: 'cancelled', state: 'cancelled' }).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId), sql`${executions.status} NOT IN ('completed','failed','cancelled')`)).returning({ id: executions.id })).length > 0); }
  casResumeSuspended(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.update(executions).set({ status: 'queued', state: 'queued' }).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId), eq(executions.status, 'suspended'))).returning({ id: executions.id })).length > 0); }
  createOutboxEntry(executionId: string, tenantId: string, command: 'cancel'|'resume') { return withTenantTx(tenantId, (tx) => insertOutboxEvent(tx, { tenantId, aggregateType: 'execution', aggregateId: executionId, eventType: command === 'cancel' ? 'ExecutionCancellationRequested' : 'ExecutionResumeRequested', payloadJson: { executionId, command }, source: 'api' }).then(() => undefined)); }
}
