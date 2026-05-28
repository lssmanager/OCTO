import { and, asc, eq, sql } from 'drizzle-orm';
import { executions, outboxEvents, withTenantTx } from '@octo/database';
import { randomUUID } from 'crypto';
import { createQueue, QUEUES } from '@octo/queue';

export class PostgresExecutionRepo {
  async createExecution(input: any, tenantId: string, createdBy: string): Promise<{ id: string }> {
    const id = randomUUID();
    await withTenantTx(tenantId, async (tx) => {
      await tx.insert(executions).values({ id, tenantId, agentId: input.agentId, agentVersionId: input.agentVersionId, status: 'queued', state: 'queued', createdBy, inputJson: input.input ?? {}, task: input.input ?? {} });
      await tx.insert(outboxEvents).values({ id: randomUUID(), tenantId, aggregateType: 'execution', aggregateId: id, eventType: 'ExecutionQueued', sequence: 1, payloadJson: { executionId: id } });
    });
    const queue = createQueue<any>(QUEUES.EXECUTION_DISPATCH, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
    await queue.add('dispatch', { executionId: id, tenantId, agentId: input.agentId, traceId: randomUUID(), expectedState: 'queued' }, { jobId: id });
    await queue.close();
    return { id };
  }
  async getExecutionSummary(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.select().from(executions).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId))).limit(1))[0] ?? null); }
  getExecutionTimeline(executionId: string, tenantId: string) { return withTenantTx(tenantId, (tx) => tx.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, executionId), eq(outboxEvents.tenantId, tenantId))).orderBy(asc(outboxEvents.sequence), asc(outboxEvents.createdAt))); }
  casRequestCancellation(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.update(executions).set({ cancellationRequestedAt: new Date(), status: 'cancelled', state: 'cancelled' }).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId), sql`${executions.status} NOT IN ('completed','failed','cancelled')`)).returning({ id: executions.id })).length > 0); }
  casResumeSuspended(executionId: string, tenantId: string) { return withTenantTx(tenantId, async (tx) => (await tx.update(executions).set({ status: 'queued', state: 'queued' }).where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId), eq(executions.status, 'suspended'))).returning({ id: executions.id })).length > 0); }
  createOutboxEntry(executionId: string, tenantId: string, command: 'cancel'|'resume') { return withTenantTx(tenantId, (tx) => tx.insert(outboxEvents).values({ id: randomUUID(), tenantId, aggregateType: 'execution', aggregateId: executionId, eventType: command === 'cancel' ? 'ExecutionCancellationRequested' : 'ExecutionResumeRequested', sequence: 2, payloadJson: { executionId, command } }).then(() => undefined)); }
}
