import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { agents, type NewAgent } from '../schema/agents';

export async function getAgentById(id: string, tenantId: string) {
  const db = getDb();
  return db.query.agents.findFirst({
    where: and(eq(agents.id, id), eq(agents.tenantId, tenantId)),
  });
}

export async function listAgents(tenantId: string, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(agents)
    .where(eq(agents.tenantId, tenantId))
    .orderBy(desc(agents.createdAt))
    .limit(limit);
}

export async function createAgent(data: NewAgent) {
  const db = getDb();
  const [created] = await db.insert(agents).values(data).returning();
  return created;
}

export async function updateAgentStatus(id: string, tenantId: string, status: NewAgent['status']) {
  const db = getDb();
  const [updated] = await db
    .update(agents)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
    .returning();
  return updated;
}
