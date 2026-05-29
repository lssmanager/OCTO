import { and, desc, eq, sql } from 'drizzle-orm';
import { withTenantTx, agents, agentVersions, hierarchyNodes } from '@octo/database';
import { randomUUID } from 'crypto';
import type { HierarchyActivationState, HierarchyLevel } from '@octo/contracts';
import { validateHierarchyRelation, type HierarchyPolicyNode } from './agent-policy-resolver.service';

const DEFAULT_HIERARCHY_LEVEL: HierarchyLevel = 'agent';

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || randomUUID();
}

function nodeConfig(row: any): Record<string, unknown> {
  return {
    modelPolicy: row.modelPolicy ?? {},
    toolPolicy: row.toolPolicy ?? {},
    budgetPolicy: row.budgetPolicy ?? {},
    governance: row.governance ?? {},
    coreFiles: row.coreFiles ?? [],
    memoryPolicy: row.memoryPolicy ?? {},
  };
}

export class PostgresAgentRepo {
  private async ensureLegacyHierarchyChain(tx: any, tenantId: string): Promise<string> {
    const levels: Array<{ level: HierarchyLevel; slug: string; name: string }> = [
      { level: 'agency', slug: 'legacy-agency', name: 'Legacy Agency' },
      { level: 'department', slug: 'legacy-department', name: 'Legacy Department' },
      { level: 'workspace', slug: 'legacy-workspace', name: 'Legacy Workspace' },
    ];
    let parentId: string | null = null;
    let currentId = '';
    for (const item of levels) {
      const existing = (await tx.select().from(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.level, item.level), eq(hierarchyNodes.slug, item.slug))).limit(1))[0];
      if (existing) {
        parentId = existing.id;
        currentId = existing.id;
        continue;
      }
      validateHierarchyRelation(parentId ? levels[levels.findIndex((v) => v.level === item.level) - 1]?.level ?? null : null, item.level);
      currentId = randomUUID();
      await tx.insert(hierarchyNodes).values({
        id: currentId,
        tenantId,
        level: item.level,
        slug: item.slug,
        name: item.name,
        parentId,
      });
      parentId = currentId;
    }
    return currentId;
  }

  private async createOperationalNode(tx: any, tenantId: string, input: any, agentId: string): Promise<string> {
    const requestedLevel = (input.hierarchyLevel ?? (input.parentId ? 'subagent' : DEFAULT_HIERARCHY_LEVEL)) as HierarchyLevel;
    let parentId = input.hierarchyParentId ?? null;
    let parentLevel: HierarchyLevel | null = null;

    if (requestedLevel === 'agent' && !parentId) {
      parentId = await this.ensureLegacyHierarchyChain(tx, tenantId);
      parentLevel = 'workspace';
    } else if (requestedLevel === 'subagent' && !parentId && input.parentId) {
      const parentAgent = (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, input.parentId))).limit(1))[0];
      parentId = parentAgent?.hierarchyNodeId ?? null;
      if (parentId) {
        const parentNode = (await tx.select().from(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, parentId))).limit(1))[0];
        parentLevel = parentNode?.level ?? null;
      } else {
        parentLevel = null;
      }
    }

    if (parentId && !parentLevel) {
      const parent = (await tx.select().from(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, parentId))).limit(1))[0];
      parentLevel = parent?.level ?? null;
    }
    validateHierarchyRelation(parentLevel, requestedLevel);

    const hierarchyNodeId = randomUUID();
    const baseSlug = input.slug ?? slugify(input.name ?? agentId);
    let uniqueSlug = baseSlug;
    let suffix = 1;
    while (true) {
      const existing = (await tx.select().from(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.parentId, parentId), eq(hierarchyNodes.slug, uniqueSlug))).limit(1))[0];
      if (!existing) break;
      uniqueSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }
    await tx.insert(hierarchyNodes).values({
      id: hierarchyNodeId,
      tenantId,
      level: requestedLevel,
      slug: uniqueSlug,
      name: input.name ?? agentId,
      parentId,
      activationState: input.activationState ?? 'active',
      modelPolicy: input.modelPolicy ?? {},
      toolPolicy: input.toolPolicy ?? {},
      budgetPolicy: input.budgetPolicy ?? {},
      governance: input.governance ?? input.governancePolicy ?? {},
      coreFiles: input.coreFiles ?? [],
      memoryPolicy: input.memoryPolicy ?? {},
    });
    return hierarchyNodeId;
  }

  async createAgentWithVersionTx(tenantId: string, _createdBy: string, input: any) {
    return withTenantTx(tenantId, async (tx) => {
      const agentId = randomUUID();
      const now = new Date();
      const hierarchyNodeId = await this.createOperationalNode(tx, tenantId, input, agentId);
      await tx.insert(agents).values({
        id: agentId,
        tenantId,
        name: input.name,
        description: input.description ?? '',
        role: input.role,
        goal: input.goal,
        parentId: input.parentId ?? null,
        hierarchyNodeId,
        capabilities: input.capabilities ?? [],
        governancePolicy: input.governancePolicy ?? input.governance ?? {},
        metadata: input.metadata ?? {},
        updatedAt: now,
      });
      await tx.insert(agentVersions).values({
        id: randomUUID(), tenantId, agentId, version: 1,
        configJson: { ...input, hierarchyNodeId, hierarchyLevel: input.hierarchyLevel ?? (input.parentId ? 'subagent' : 'agent'), version: 1, createdAt: now.toISOString() },
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
  async getAgentLocalConfig(tenantId: string, agentId: string) {
    const latest = await this.getLatestAgentVersion(tenantId, agentId);
    return (latest?.configJson as Record<string, unknown> | undefined) ?? null;
  }
  async getWorkspacePolicyDefaults(tenantId: string, workspaceId: string) {
    if (!workspaceId) return {};
    return withTenantTx(tenantId, async (tx) => {
      const workspace = (await tx.select().from(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, workspaceId), eq(hierarchyNodes.level, 'workspace'))).limit(1))[0];
      return workspace ? nodeConfig(workspace) : {};
    });
  }
  async getHierarchyPolicyChain(tenantId: string, agentId: string): Promise<HierarchyPolicyNode[] | null> {
    return withTenantTx(tenantId, async (tx) => {
      const agent = (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId))).limit(1))[0];
      if (!agent) return null;
      if (!agent.hierarchyNodeId) return [];
      const rows = await tx.execute(sql`
        WITH RECURSIVE chain AS (
          SELECT *, 0 AS depth FROM hierarchy_nodes WHERE tenant_id=${tenantId} AND id=${agent.hierarchyNodeId}
          UNION ALL
          SELECT parent.*, chain.depth + 1 AS depth
          FROM hierarchy_nodes parent
          JOIN chain ON chain.parent_id = parent.id
          WHERE parent.tenant_id=${tenantId}
        )
        SELECT * FROM chain ORDER BY depth DESC
      `);
      return ((rows as any).rows ?? []).map((row: any) => ({
        id: row.id,
        level: row.level as HierarchyLevel,
        parentId: row.parent_id ?? null,
        activationState: row.activation_state as HierarchyActivationState,
        config: {
          modelPolicy: row.model_policy ?? {},
          toolPolicy: row.tool_policy ?? {},
          budgetPolicy: row.budget_policy ?? {},
          governance: row.governance ?? {},
          coreFiles: row.core_files ?? [],
          memoryPolicy: row.memory_policy ?? {},
        },
      }));
    });
  }
  async getAgentVersion(tenantId: string, agentId: string) { const latest = await this.getLatestAgentVersion(tenantId, agentId); return latest?.version ?? 0; }
}
