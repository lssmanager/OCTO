import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { executions, executionSteps, withTenantTx, insertOutboxEvent } from '@octo/database';

export type DispatchPayload = { executionId: string; tenantId: string; agentId?: string; traceId?: string; expectedState?: string; expectedVersion?: number };
export type RuntimePayload = { executionId: string; tenantId: string; agentId: string; traceId: string };

export async function processExecutionDispatchJob(
  data: DispatchPayload,
  deps: { workerId: string; leaseSeconds: number; invokeRuntime: (payload: RuntimePayload) => Promise<void> }
): Promise<'dispatched'|'skipped'> {
  if (!data.executionId || !data.tenantId) throw new Error('invalid_dispatch_payload');
  const transitioned = await withTenantTx(data.tenantId, async (tx) => {
    const current = (await tx.select().from(executions).where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId))).limit(1))[0];
    if (!current) throw new Error('execution_not_found');
    if (['completed','failed','cancelled'].includes(String(current.status))) return false;
    const now = new Date(); const lease = new Date(now.getTime() + deps.leaseSeconds * 1000);
    const updated = await tx.update(executions).set({ state: 'dispatched', status: 'dispatched', leaseOwner: deps.workerId, leaseExpiresAt: lease, version: sql`${executions.version}+1`, updatedAt: now }).where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId), eq(executions.status, 'queued'))).returning({ id: executions.id });
    if (!updated.length) return false;
    await tx.insert(executionSteps).values({ id: randomUUID(), tenantId: data.tenantId, executionId: data.executionId, stepIndex: 0, stepType: 'reasoning', status: 'running', stateFrom: 'queued', stateTo: 'dispatched', inputJson: { reason: 'dispatch' }, outputJson: { workerId: deps.workerId } });
    await insertOutboxEvent(tx, { tenantId: data.tenantId, aggregateType: 'execution', aggregateId: data.executionId, eventType: 'ExecutionDispatched', payloadJson: { executionId: data.executionId, workerId: deps.workerId }, traceId: data.traceId ?? null, source: 'scheduler-worker' });
    return { agentId: current.agentId as string };
  });
  if (!transitioned) return 'skipped';
  await deps.invokeRuntime({ executionId: data.executionId, tenantId: data.tenantId, agentId: data.agentId ?? transitioned.agentId, traceId: data.traceId ?? randomUUID() });
  return 'dispatched';
}
