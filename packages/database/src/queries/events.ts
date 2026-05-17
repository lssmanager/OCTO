import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { executionEvents, type NewExecutionEvent } from '../schema/events';

export async function insertEvent(data: Omit<NewExecutionEvent, 'id'>) {
  const db = getDb();
  const [created] = await db
    .insert(executionEvents)
    .values(data)
    .returning();
  return created;
}

/**
 * Returns the full event timeline for an execution in chronological order.
 * Uses the bigint PK natural sort — no explicit orderBy needed, but added for clarity.
 */
export async function getExecutionTimeline(executionId: string) {
  const db = getDb();
  return db
    .select()
    .from(executionEvents)
    .where(eq(executionEvents.executionId, executionId))
    .orderBy(executionEvents.createdAt);
}
