import { and, desc, eq, sql } from 'drizzle-orm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { withTenantTx, agents, agentVersions, hierarchyNodes } from '@octo/database';
import { randomUUID } from 'crypto';
import type { HierarchyActivationState, HierarchyLevel } from '@octo/contracts';
import { normalizeCapabilities, resolveEffectivePolicyConfig, validateHierarchyRelation, type HierarchyPolicyNode, type PolicyConfig } from './agent-policy-resolver.service';
import type { AgentGraphNode, HierarchyNodeDto, PatchAgentDto, PatchHierarchyNodeDto, ReparentHierarchyNodeDto } from './agent.service';

const DEFAULT_HIERARCHY_LEVEL: HierarchyLevel = 'agent';
const F1_AGENT_GRAPH_LEVELS = new Set<HierarchyLevel>(['agency', 'department', 'workspace', 'agent']);
const ACTIVATION_STATES = new Set(['active', 'inactive', 'paused', 'archived']);

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || randomUUID();
}

function nodeConfig(row: any): Record<string, unknown> {
  return {
    modelPolicy: row.modelPolicy ?? {},
    toolPolicy: row.toolPolicy ?? {},
    budgetPolicy: row.budgetPolicy ?? {},
    governance: row.governance ?? {},
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    coreFiles: row.coreFiles ?? [],
    memoryPolicy: row.memoryPolicy ?? {},
  };
}

function asCapabilities(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [];
}

function validateActivationState(value: unknown): void {
  if (value !== undefined && !ACTIVATION_STATES.has(value as string)) {
    throw new BadRequestException('invalid_activation_state');
  }
}

function normalizeActivationState(value: unknown): HierarchyActivationState {
  validateActivationState(value);
  return value === 'paused' ? 'inactive' : (value as HierarchyActivationState | undefined) ?? 'active';
}

function pickAgentPatch(input: PatchAgentDto): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'description', 'role', 'goal', 'parentId', 'capabilities', 'governancePolicy', 'metadata', 'status'] as const) {
    if (input[key] !== undefined) patch[key] = key === 'capabilities' ? normalizeCapabilities(input[key]) : input[key];
  }
  if (Object.keys(patch).length > 0) patch['updatedAt'] = new Date();
  return patch;
}

function pickNodePatch(input: PatchAgentDto | PatchHierarchyNodeDto): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'slug', 'activationState', 'modelPolicy', 'toolPolicy', 'budgetPolicy', 'governance', 'capabilities', 'coreFiles', 'memoryPolicy'] as const) {
    if ((input as any)[key] !== undefined) patch[key] = key === 'activationState' ? normalizeActivationState((input as any)[key]) : key === 'capabilities' ? normalizeCapabilities((input as any)[key]) : (input as any)[key];
  }
  if (Object.keys(patch).length > 0) patch['updatedAt'] = new Date();
  return patch;
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
      await tx.insert(hierarchyNodes).values({ id: currentId, tenantId, level: item.level, slug: item.slug, name: item.name, parentId });
      parentId = currentId;
    }
    return currentId;
  }

  private async findNode(tx: any, tenantId: string, nodeId: string) {
    return (await tx.select().from(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, nodeId))).limit(1))[0] ?? null;
  }

  private async assertParentForLevel(tx: any, tenantId: string, parentId: string | null, childLevel: HierarchyLevel) {
    let parentLevel: HierarchyLevel | null = null;
    if (parentId) {
      const parent = await this.findNode(tx, tenantId, parentId);
      if (!parent) throw new NotFoundException('hierarchy_parent_not_found');
      parentLevel = parent.level as HierarchyLevel;
    }
    validateHierarchyRelation(parentLevel, childLevel);
  }

  private async assertNotDescendantParent(tx: any, tenantId: string, nodeId: string, parentId: string | null) {
    if (!parentId) return;
    if (nodeId === parentId) throw new BadRequestException('invalid_hierarchy_parent:self_parent');
    const rows = await tx.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM hierarchy_nodes WHERE tenant_id=${tenantId} AND parent_id=${nodeId}
        UNION ALL
        SELECT child.id
        FROM hierarchy_nodes child
        JOIN descendants ON child.parent_id = descendants.id
        WHERE child.tenant_id=${tenantId}
      )
      SELECT id FROM descendants WHERE id=${parentId} LIMIT 1
    `);
    if (((rows as any).rows ?? []).length > 0) {
      throw new BadRequestException('invalid_hierarchy_parent:cycle');
    }
  }

  private async descendantAgentNodeIds(tx: any, tenantId: string, nodeId: string): Promise<string[]> {
    const rows = await tx.execute(sql`
      WITH RECURSIVE subtree AS (
        SELECT id, level FROM hierarchy_nodes WHERE tenant_id=${tenantId} AND id=${nodeId}
        UNION ALL
        SELECT child.id, child.level
        FROM hierarchy_nodes child
        JOIN subtree ON child.parent_id = subtree.id
        WHERE child.tenant_id=${tenantId}
      )
      SELECT id FROM subtree WHERE level='agent'
    `);
    return (((rows as any).rows ?? []) as Array<{ id: string }>).map((row) => row.id);
  }

  private async syncAgentMetadataForSubtree(tx: any, tenantId: string, nodeId: string) {
    const agentNodeIds = await this.descendantAgentNodeIds(tx, tenantId, nodeId);
    for (const agentNodeId of agentNodeIds) {
      const linkedAgent = (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.hierarchyNodeId, agentNodeId))).limit(1))[0];
      if (!linkedAgent) continue;
      const scopeMetadata = await this.hierarchyScopeMetadata(tx, tenantId, agentNodeId);
      await tx.update(agents).set({ metadata: { ...((linkedAgent.metadata ?? {}) as Record<string, unknown>), ...scopeMetadata }, updatedAt: new Date() }).where(and(eq(agents.tenantId, tenantId), eq(agents.id, linkedAgent.id)));
    }
  }

  private async hierarchyScopeMetadata(tx: any, tenantId: string, nodeId: string): Promise<Record<string, string>> {
    const rows = await tx.execute(sql`
      WITH RECURSIVE chain AS (
        SELECT id, level, parent_id, 0 AS depth FROM hierarchy_nodes WHERE tenant_id=${tenantId} AND id=${nodeId}
        UNION ALL
        SELECT parent.id, parent.level, parent.parent_id, chain.depth + 1 AS depth
        FROM hierarchy_nodes parent
        JOIN chain ON chain.parent_id = parent.id
        WHERE parent.tenant_id=${tenantId}
      )
      SELECT id, level FROM chain
    `);
    const metadata: Record<string, string> = {};
    for (const row of ((rows as any).rows ?? []) as Array<{ id: string; level: string }>) {
      if (row.level === 'agency') metadata['agencyId'] = row.id;
      if (row.level === 'workspace') metadata['workspaceId'] = row.id;
    }
    return metadata;
  }

  private async createOperationalNode(tx: any, tenantId: string, input: any, agentId: string): Promise<string> {
    validateActivationState(input.activationState);
    const requestedLevel = (input.hierarchyLevel ?? DEFAULT_HIERARCHY_LEVEL) as HierarchyLevel;
    if (requestedLevel !== 'agent') validateHierarchyRelation(null, requestedLevel);
    let parentId = input.hierarchyParentId ?? null;

    if (requestedLevel === 'agent' && !parentId) {
      parentId = await this.ensureLegacyHierarchyChain(tx, tenantId);
    }
    await this.assertParentForLevel(tx, tenantId, parentId, requestedLevel);

    const hierarchyNodeId = randomUUID();
    await tx.insert(hierarchyNodes).values({
      id: hierarchyNodeId,
      tenantId,
      level: requestedLevel,
      slug: input.slug ?? slugify(input.name ?? agentId),
      name: input.name ?? agentId,
      parentId,
      activationState: normalizeActivationState(input.activationState),
      modelPolicy: input.modelPolicy ?? {},
      toolPolicy: input.toolPolicy ?? {},
      budgetPolicy: input.budgetPolicy ?? {},
      governance: input.governance ?? input.governancePolicy ?? {},
      capabilities: [],
      coreFiles: input.coreFiles ?? [],
      memoryPolicy: input.memoryPolicy ?? {},
    });
    return hierarchyNodeId;
  }

  async createAgentWithVersionTx(tenantId: string, _createdBy: string, input: any) {
    return withTenantTx(tenantId, async (tx: any) => {
      const agentId = randomUUID();
      const now = new Date();
      const hierarchyNodeId = await this.createOperationalNode(tx, tenantId, input, agentId);
      const scopeMetadata = await this.hierarchyScopeMetadata(tx, tenantId, hierarchyNodeId);
      await tx.insert(agents).values({
        id: agentId,
        tenantId,
        name: input.name,
        description: input.description ?? '',
        role: input.role,
        goal: input.goal,
        parentId: input.parentId ?? null,
        hierarchyNodeId,
        capabilities: normalizeCapabilities(input.capabilities),
        governancePolicy: input.governancePolicy ?? input.governance ?? {},
        metadata: { ...(input.metadata ?? {}), ...scopeMetadata },
        updatedAt: now,
      });
      await tx.insert(agentVersions).values({
        id: randomUUID(), tenantId, agentId, version: 1,
        configJson: { ...input, hierarchyNodeId, hierarchyLevel: 'agent', version: 1, createdAt: now.toISOString() },
      });
      const [row] = await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
      return row!;
    });
  }

  async getAgentGraph(tenantId: string) {
    return withTenantTx(tenantId, async (tx: any) => this.buildGraph(tx, tenantId));
  }

  async getHierarchyNodeDetail(tenantId: string, nodeId: string) {
    return withTenantTx(tenantId, async (tx: any) => {
      const nodes = await this.buildGraph(tx, tenantId);
      const stack = [...nodes];
      while (stack.length) {
        const node = stack.shift()!;
        if (node.id === nodeId) return node;
        stack.push(...node.children);
      }
      return null;
    });
  }

  async createHierarchyNodeTx(tenantId: string, input: HierarchyNodeDto) {
    validateActivationState(input.activationState);
    return withTenantTx(tenantId, async (tx: any) => {
      await this.assertParentForLevel(tx, tenantId, input.parentId ?? null, input.level as HierarchyLevel);
      const id = randomUUID();
      await tx.insert(hierarchyNodes).values({
        id,
        tenantId,
        level: input.level,
        name: input.name,
        slug: input.slug ?? slugify(input.name),
        parentId: input.parentId ?? null,
        activationState: normalizeActivationState(input.activationState),
        modelPolicy: input.modelPolicy ?? {},
        toolPolicy: input.toolPolicy ?? {},
        budgetPolicy: input.budgetPolicy ?? {},
        governance: input.governance ?? {},
        capabilities: normalizeCapabilities(input.capabilities),
        coreFiles: input.coreFiles ?? [],
        memoryPolicy: input.memoryPolicy ?? {},
      });
      return (await this.nodeDetailInTx(tx, tenantId, id))!;
    });
  }

  async patchHierarchyNodeTx(tenantId: string, nodeId: string, input: PatchHierarchyNodeDto) {
    validateActivationState(input.activationState);
    return withTenantTx(tenantId, async (tx: any) => {
      const patch = pickNodePatch(input);
      if (Object.keys(patch).length > 0) await tx.update(hierarchyNodes).set(patch as any).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, nodeId)));
      return this.nodeDetailInTx(tx, tenantId, nodeId);
    });
  }

  async reparentHierarchyNodeTx(tenantId: string, nodeId: string, input: ReparentHierarchyNodeDto) {
    return withTenantTx(tenantId, async (tx: any) => {
      const node = await this.findNode(tx, tenantId, nodeId);
      if (!node) return null;
      await this.assertNotDescendantParent(tx, tenantId, nodeId, input.parentId);
      await this.assertParentForLevel(tx, tenantId, input.parentId, node.level as HierarchyLevel);
      await tx.update(hierarchyNodes).set({ parentId: input.parentId, updatedAt: new Date() }).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, nodeId)));
      await this.syncAgentMetadataForSubtree(tx, tenantId, nodeId);
      return this.nodeDetailInTx(tx, tenantId, nodeId);
    });
  }

  listAgents(tenantId: string, limit: number) { return withTenantTx(tenantId, (tx: any) => tx.select().from(agents).where(eq(agents.tenantId, tenantId)).limit(limit)); }
  async getAgentById(tenantId: string, id: string) { return withTenantTx(tenantId, async (tx: any) => (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).limit(1))[0] ?? null); }

  async patchAgentTx(tenantId: string, id: string, input: PatchAgentDto) {
    validateActivationState(input.activationState);
    return withTenantTx(tenantId, async (tx: any) => {
      const agent = (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).limit(1))[0];
      if (!agent) return null;
      const agentPatch = pickAgentPatch(input);
      const nodePatch = pickNodePatch(input);
      delete nodePatch['capabilities'];
      if (input.hierarchyParentId !== undefined && agent.hierarchyNodeId) {
        await this.assertNotDescendantParent(tx, tenantId, agent.hierarchyNodeId, input.hierarchyParentId);
        await this.assertParentForLevel(tx, tenantId, input.hierarchyParentId, 'agent');
        nodePatch['parentId'] = input.hierarchyParentId;
      }
      if (agent.hierarchyNodeId && Object.keys(nodePatch).length > 0) {
        await tx.update(hierarchyNodes).set(nodePatch as any).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, agent.hierarchyNodeId)));
      }
      if (input.hierarchyParentId !== undefined && agent.hierarchyNodeId) {
        const scopeMetadata = await this.hierarchyScopeMetadata(tx, tenantId, agent.hierarchyNodeId);
        agentPatch['metadata'] = { ...((agent.metadata ?? {}) as Record<string, unknown>), ...scopeMetadata, ...((input.metadata ?? {}) as Record<string, unknown>) };
      }
      if (Object.keys(agentPatch).length > 0) await tx.update(agents).set(agentPatch as any).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id)));
      return (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).limit(1))[0] ?? null;
    });
  }

  async deleteAgentTx(tenantId: string, id: string) {
    return withTenantTx(tenantId, async (tx: any) => {
      const agent = (await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).limit(1))[0];
      if (!agent) return false;
      if (agent.hierarchyNodeId && (await this.descendantAgentNodeIds(tx, tenantId, agent.hierarchyNodeId)).filter((nodeId) => nodeId !== agent.hierarchyNodeId).length > 0) {
        throw new BadRequestException('agent_delete_blocked_by_descendants');
      }
      await tx.delete(agentVersions).where(and(eq(agentVersions.tenantId, tenantId), eq(agentVersions.agentId, id)));
      await tx.delete(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id)));
      if (agent.hierarchyNodeId) await tx.delete(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, agent.hierarchyNodeId)));
      return true;
    });
  }

  listAgentVersions(tenantId: string, agentId: string, limit: number) { return withTenantTx(tenantId, (tx: any) => tx.select().from(agentVersions).where(and(eq(agentVersions.tenantId, tenantId), eq(agentVersions.agentId, agentId))).orderBy(desc(agentVersions.version)).limit(limit)); }
  async getLatestAgentVersion(tenantId: string, agentId: string) { return withTenantTx(tenantId, async (tx: any) => (await tx.select().from(agentVersions).where(and(eq(agentVersions.tenantId, tenantId), eq(agentVersions.agentId, agentId))).orderBy(desc(agentVersions.version)).limit(1))[0] ?? null); }
  async resolveEffectivePolicySnapshot(tenantId: string, agentId: string) {
    const agent = await this.getAgentById(tenantId, agentId);
    if (!agent) return null;
    return { governancePolicy: agent.governancePolicy ?? {}, capabilities: agent.capabilities ?? [] };
  }
  async getAgentLocalConfig(tenantId: string, agentId: string) {
    const latest = await this.getLatestAgentVersion(tenantId, agentId);
    return (latest?.configJson as Record<string, unknown> | undefined) ?? null;
  }
  async getAgentCapabilities(tenantId: string, agentId: string) {
    const agent = await this.getAgentById(tenantId, agentId);
    return agent?.capabilities ?? [];
  }
  async getWorkspacePolicyDefaults(tenantId: string, workspaceId: string) {
    if (!workspaceId) return {};
    return withTenantTx(tenantId, async (tx: any) => {
      const workspace = (await tx.select().from(hierarchyNodes).where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, workspaceId), eq(hierarchyNodes.level, 'workspace'))).limit(1))[0];
      return workspace ? nodeConfig(workspace) : {};
    });
  }
  async getHierarchyPolicyChain(tenantId: string, agentId: string): Promise<HierarchyPolicyNode[] | null> {
    return withTenantTx(tenantId, async (tx: any) => {
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
          capabilities: row.capabilities ?? [],
          coreFiles: row.core_files ?? [],
          memoryPolicy: row.memory_policy ?? {},
        },
      }));
    });
  }
  async getAgentVersion(tenantId: string, agentId: string) { const latest = await this.getLatestAgentVersion(tenantId, agentId); return latest?.version ?? 0; }

  private async nodeDetailInTx(tx: any, tenantId: string, nodeId: string) {
    const nodes = await this.buildGraph(tx, tenantId);
    const stack = [...nodes];
    while (stack.length) {
      const node = stack.shift()!;
      if (node.id === nodeId) return node;
      stack.push(...node.children);
    }
    return null;
  }

  private async buildGraph(tx: any, tenantId: string): Promise<AgentGraphNode[]> {
    const nodeRows = await tx.select().from(hierarchyNodes).where(eq(hierarchyNodes.tenantId, tenantId));
    const agentRows = await tx.select().from(agents).where(eq(agents.tenantId, tenantId));
    const agentByNode = new Map(agentRows.filter((agent: any) => agent.hierarchyNodeId).map((agent: any) => [agent.hierarchyNodeId, agent]));
    const rawById = new Map(nodeRows.map((node: any) => [node.id, node]));

    const configCache = new Map<string, Record<string, unknown>>();
    const effectiveConfig = (node: any, agent?: any): Record<string, unknown> => {
      const cacheKey = `${node.id}:${agent?.id ?? ''}:${JSON.stringify(agent?.capabilities ?? [])}`;
      const cached = configCache.get(cacheKey);
      if (cached) return cached;
      const chain: PolicyConfig[] = [];
      let cursor: any | undefined = node;
      const visited = new Set<string>();
      while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        chain.unshift(nodeConfig(cursor) as PolicyConfig);
        cursor = cursor.parentId ? rawById.get(cursor.parentId) : undefined;
      }
      if (agent) chain.push({ capabilities: asCapabilities(agent.capabilities) });
      const merged = resolveEffectivePolicyConfig(chain) as unknown as Record<string, unknown>;
      configCache.set(cacheKey, merged);
      return merged;
    };

    const byId = new Map<string, AgentGraphNode>();
    for (const row of nodeRows) {
      if (!F1_AGENT_GRAPH_LEVELS.has(row.level as HierarchyLevel)) continue;
      const agent = agentByNode.get(row.id) as any | undefined;
      const node: AgentGraphNode = {
        id: row.id,
        tenantId: row.tenantId,
        level: row.level as AgentGraphNode['level'],
        name: row.name,
        slug: row.slug,
        parentId: row.parentId ?? null,
        activationState: row.activationState,
        runtimeStatus: null,
        agent: agent ? {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          goal: agent.goal,
          status: agent.status,
          capabilities: agent.capabilities ?? [],
          governancePolicy: agent.governancePolicy ?? {},
          metadata: agent.metadata ?? {},
        } : null,
        localPolicies: nodeConfig(row),
        effectivePolicies: effectiveConfig(row, agent),
        effectiveCapabilities: (effectiveConfig(row, agent)['capabilities'] as string[] | undefined) ?? [],
        children: [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      byId.set(node.id, node);
    }

    const roots: AgentGraphNode[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    const sort = (nodes: AgentGraphNode[]) => {
      nodes.sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name));
      for (const node of nodes) sort(node.children);
    };
    sort(roots);
    return roots;
  }
}
