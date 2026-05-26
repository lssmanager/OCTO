import { and, desc, eq, sql } from 'drizzle-orm';
import { withTenantTx, agents, agentVersions } from '@octo/database';
import { randomUUID } from 'crypto';

export class PostgresAgentRepo {
  async createAgentWithVersionTx(tenantId: string, _createdBy: string, input: any) {
    return withTenantTx(tenantId, async (tx) => {
      const agentId = randomUUID();
      const now = new Date();
      await tx.insert(agents).values({
        id: agentId,
        tenantId,
        name: input.name,
        description: input.description ?? '',
        role: input.role,
        goal: input.goal,
        parentId: input.parentId ?? null,
        capabilities: input.capabilities ?? [],
        governancePolicy: input.governancePolicy ?? {},
        metadata: input.metadata ?? {},
        updatedAt: now,
      });
      await tx.insert(agentVersions).values({
        id: randomUUID(), tenantId, agentId, version: 1,
        configJson: { ...input, version: 1, createdAt: now.toISOString() },
      });
      const [row] = await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
      return row!;
    });
  }

  listAgents(tenantId: string, limit: number) { return withTenantTx(tenantId, (tx) => tx.select().from(agents).where(eq(agents.tenantId, tenantId)).limit(limit)); }
  async getAgentById(tenantId: string, id: string) { return withTenantTx(tenantId, async (tx) => (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).limit(1))[0] ?? null); }
  async patchAgentTx(tenantId: string, id: string, input: any) {
    return withTenantTx(tenantId, async (tx) => {
      await tx.update(agents).set({ ...input, updatedAt: new Date() }).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id)));
      return (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).limit(1))[0] ?? null;
    });
  }
  async deleteAgentTx(tenantId: string, id: string) { return withTenantTx(tenantId, async (tx) => Number((await tx.delete(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).returning({ n: sql<number>`1` })).length) > 0); }
  listAgentVersions(tenantId: string, agentId: string, limit: number) { return withTenantTx(tenantId, (tx) => tx.select().from(agentVersions).where(and(eq(agentVersions.tenantId, tenantId), eq(agentVersions.agentId, agentId))).orderBy(desc(agentVersions.version)).limit(limit)); }
  async getLatestAgentVersion(tenantId: string, agentId: string) { return withTenantTx(tenantId, async (tx) => (await tx.select().from(agentVersions).where(and(eq(agentVersions.tenantId, tenantId), eq(agentVersions.agentId, agentId))).orderBy(desc(agentVersions.version)).limit(1))[0] ?? null); }
  async resolveEffectivePolicySnapshot(tenantId: string, agentId: string) {
    const agent = await this.getAgentById(tenantId, agentId);
    if (!agent) return null;
    return { governancePolicy: agent.governancePolicy ?? {}, capabilities: agent.capabilities ?? [] };
  }
  async getAgentLocalConfig(tenantId: string, agentId: string) { return this.getLatestAgentVersion(tenantId, agentId); }
  async getWorkspacePolicyDefaults() { return {}; }
  async getAgentVersion(tenantId: string, agentId: string) { const latest = await this.getLatestAgentVersion(tenantId, agentId); return latest?.version ?? 0; }
}
