import { eq, desc } from 'drizzle-orm';
import { getDb } from '../client';
import { agents, type NewAgent } from '../schema/agents';

export async function getAgentById(id: string) {
  const db = getDb();
  return db.query.agents.findFirst({
    where: eq(agents.id, id),
  });
}

export async function listAgents(limit = 50) {
  const db = getDb();
  return db.select().from(agents).orderBy(desc(agents.createdAt)).limit(limit);
}

export async function createAgent(data: NewAgent) {
  const db = getDb();
  const [created] = await db.insert(agents).values(data).returning();
  return created;
}

export async function updateAgentStatus(id: string, status: NewAgent['status']) {
  const db = getDb();
  const [updated] = await db
    .update(agents)
    .set({ status, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning();
  return updated;
}
