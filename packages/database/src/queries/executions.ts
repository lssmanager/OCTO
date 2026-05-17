import { eq, desc } from 'drizzle-orm';
import { getDb } from '../client';
import { executions, type NewExecution } from '../schema/executions';

export async function getExecution(id: string) {
  const db = getDb();
  return db.query.executions.findFirst({
    where: eq(executions.id, id),
    with: { agents: true },
  });
}

export async function listExecutionsByAgent(agentId: string, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(executions)
    .where(eq(executions.agentId, agentId))
    .orderBy(desc(executions.createdAt))
    .limit(limit);
}

export async function createExecution(data: NewExecution) {
  const db = getDb();
  const [created] = await db.insert(executions).values(data).returning();
  return created;
}

export async function updateExecutionStatus(
  id: string,
  status: NewExecution['status'],
  extra?: Partial<NewExecution>,
) {
  const db = getDb();
  const [updated] = await db
    .update(executions)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(executions.id, id))
    .returning();
  return updated;
}

/**
 * Persists a LangGraph checkpoint for pause/resume support (F2).
 * Sets status to 'paused' and stores the serialized graph state.
 */
export async function saveCheckpoint(
  id: string,
  checkpoint: Record<string, unknown>,
) {
  return updateExecutionStatus(id, 'paused', { checkpoint });
}
