import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { executions, executionSteps, outboxEvents, withTenantTx } from '@octo/database';

export type DispatchPayload = { executionId: string; tenantId: string; agentId?: string; traceId?: string; expectedState?: string; expectedVersion?: number };

export async function nextOutboxSequence(tx: any, tenantId: string, aggregateType: string, aggregateId: string): Promise<number> {
  const row = await tx.execute(sql`SELECT COALESCE(MAX(sequence),0)+1 AS next FROM outbox_events WHERE tenant_id=${tenantId} AND aggregate_type=${aggregateType} AND aggregate_id=${aggregateId} FOR UPDATE`);
  return Number((row as any).rows?.[0]?.next ?? 1);
}

export async function processExecutionDispatchJob(
  data: DispatchPayload,
  deps: { workerId: string; leaseSeconds: number; invokeRuntime: (payload: { executionId: string; tenantId: string; traceId: string }) => Promise<void> }
): Promise<'dispatched'|'skipped'> {
  if (!data.executionId || !data.tenantId) throw new Error('invalid_dispatch_payload');
  const transitioned = await withTenantTx(data.tenantId, async (tx) => {
    const current = (await tx.select().from(executions).where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId))).limit(1))[0];
    if (!current) throw new Error('execution_not_found');
    if (['SUCCEEDED','FAILED','CANCELLED'].includes(String(current.state))) return false;
    const now = new Date(); const lease = new Date(now.getTime() + deps.leaseSeconds * 1000);
    const updated = await tx.update(executions).set({ state: 'DISPATCHED', status: 'dispatched', leaseOwner: deps.workerId, leaseExpiresAt: lease, version: sql`${executions.version}+1`, updatedAt: now }).where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId), eq(executions.state, 'QUEUED'))).returning({ id: executions.id });
    if (!updated.length) return false;
    await tx.insert(executionSteps).values({ id: randomUUID(), tenantId: data.tenantId, executionId: data.executionId, stepIndex: 0, stepType: 'reasoning', status: 'RUNNING', stateFrom: 'QUEUED', stateTo: 'DISPATCHED', inputJson: { reason: 'dispatch' }, outputJson: { workerId: deps.workerId } });
    const seq = await nextOutboxSequence(tx, data.tenantId, 'execution', data.executionId);
    await tx.insert(outboxEvents).values({ id: randomUUID(), tenantId: data.tenantId, aggregateType: 'execution', aggregateId: data.executionId, eventType: 'ExecutionDispatched', sequence: seq, payloadJson: { executionId: data.executionId, workerId: deps.workerId } });
    return true;
  });
  if (!transitioned) return 'skipped';
  await deps.invokeRuntime({ executionId: data.executionId, tenantId: data.tenantId, traceId: data.traceId ?? randomUUID() });
  return 'dispatched';
}
