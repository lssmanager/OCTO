import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { executions, type NewExecution } from '../schema/executions';

export async function getExecution(id: string, tenantId: string) {
  const db = getDb();
  return db.query.executions.findFirst({
    where: and(eq(executions.id, id), eq(executions.tenantId, tenantId)),
    with: { agents: true },
  });
}

export async function listExecutionsByAgent(agentId: string, tenantId: string, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(executions)
    .where(and(eq(executions.agentId, agentId), eq(executions.tenantId, tenantId)))
    .orderBy(desc(executions.createdAt))
    .limit(limit);
}

export async function createExecution(data: NewExecution) {
  const db = getDb();
  const [created] = await db.insert(executions).values(data).returning();
  return created;
}

/**
 * @deprecated — Use ExecutionStateService.transition() instead.
 * Only valid for internal FSM use. Passing skipFsmGuard=true draws
 * intentional attention to every direct-write bypass.
 */
export async function updateExecutionStatus(
  id: string,
  tenantId: string,
  status: NewExecution['status'],
  extra?: Partial<NewExecution>,
  skipFsmGuard?: true
) {
  if (!skipFsmGuard) {
    throw new Error(
      'updateExecutionStatus called without skipFsmGuard=true. ' +
        'Use ExecutionStateService.transition() for all status changes.'
    );
  }
  const db = getDb();
  const [updated] = await db
    .update(executions)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(and(eq(executions.id, id), eq(executions.tenantId, tenantId)))
    .returning();
  return updated;
}

/**
 * Persists a LangGraph checkpoint for pause/resume support (F2).
 * Sets status to 'suspended' and stores the serialized graph state.
 * Note: the canonical status for a paused execution is 'suspended'
 * per the executionStatusEnum definition in schema/executions.ts.
 *
 * Uses updateExecutionStatus with skipFsmGuard=true because this is
 * invoked by the FSM-authorised path through ExecutionStateService.
 */
export async function saveCheckpoint(id: string, tenantId: string, checkpoint: Record<string, unknown>) {
  return updateExecutionStatus(id, tenantId, 'suspended', { checkpoint }, true);
}
