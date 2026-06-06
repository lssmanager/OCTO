import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentPolicyResolverService } from './agent-policy-resolver.service';

export type AgentRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  role: string;
  goal: string;
  parentId: string | null;
  hierarchyNodeId: string | null;
  capabilities: unknown;
  governancePolicy: Record<string, unknown>;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentVersionRecord = {
  id: string;
  tenantId: string;
  agentId: string;
  version: number;
  configJson: Record<string, unknown>;
  createdAt: Date;
};

export type HierarchyLevelDto = 'agency' | 'department' | 'workspace' | 'agent';

export type HierarchyNodeDto = {
  name: string;
  slug?: string;
  level: HierarchyLevelDto;
  parentId?: string | null;
  activationState?: 'active' | 'inactive' | 'paused' | 'archived';
  modelPolicy?: Record<string, unknown>;
  toolPolicy?: Record<string, unknown>;
  budgetPolicy?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  capabilities?: unknown;
  coreFiles?: unknown[];
  memoryPolicy?: Record<string, unknown>;
};

export type PatchHierarchyNodeDto = Partial<Omit<HierarchyNodeDto, 'level'>>;
export type ReparentHierarchyNodeDto = { parentId: string | null };

export type AgentGraphNode = {
  id: string;
  tenantId: string;
  level: HierarchyLevelDto;
  name: string;
  slug: string;
  parentId: string | null;
  activationState: string;
  runtimeStatus: string | null;
  agent: Pick<AgentRecord, 'id' | 'name' | 'role' | 'goal' | 'status' | 'capabilities' | 'governancePolicy' | 'metadata'> | null;
  localPolicies: Record<string, unknown>;
  effectivePolicies: Record<string, unknown>;
  effectiveCapabilities: unknown[];
  children: AgentGraphNode[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAgentDto = {
  name: string;
  description?: string;
  role: string;
  goal: string;
  parentId?: string | null;
  capabilities?: unknown;
  governancePolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  hierarchyLevel?: 'agent';
  hierarchyParentId?: string | null;
  activationState?: 'active' | 'inactive' | 'paused' | 'archived';
  modelPolicy?: Record<string, unknown>;
  toolPolicy?: Record<string, unknown>;
  budgetPolicy?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  coreFiles?: unknown[];
  memoryPolicy?: Record<string, unknown>;
};

export type PatchAgentDto = Partial<CreateAgentDto & { status: string }>;

@Injectable()
export class AgentService {
  constructor(
    private readonly repo: {
      createAgentWithVersionTx: (tenantId: string, createdBy: string, input: CreateAgentDto) => Promise<AgentRecord>;
      listAgents: (tenantId: string, limit: number) => Promise<AgentRecord[]>;
      getAgentById: (tenantId: string, id: string) => Promise<AgentRecord | null>;
      patchAgentTx: (tenantId: string, id: string, input: PatchAgentDto, updatedBy: string) => Promise<AgentRecord | null>;
      deleteAgentTx: (tenantId: string, id: string, deletedBy: string) => Promise<boolean>;
      listAgentVersions: (tenantId: string, agentId: string, limit: number) => Promise<AgentVersionRecord[]>;
      getLatestAgentVersion: (tenantId: string, agentId: string) => Promise<AgentVersionRecord | null>;
      resolveEffectivePolicySnapshot: (tenantId: string, agentId: string) => Promise<Record<string, unknown> | null>;
      getAgentGraph: (tenantId: string) => Promise<AgentGraphNode[]>;
      getHierarchyNodeDetail: (tenantId: string, nodeId: string) => Promise<AgentGraphNode | null>;
      createHierarchyNodeTx: (tenantId: string, input: HierarchyNodeDto) => Promise<AgentGraphNode>;
      patchHierarchyNodeTx: (tenantId: string, nodeId: string, input: PatchHierarchyNodeDto) => Promise<AgentGraphNode | null>;
      reparentHierarchyNodeTx: (tenantId: string, nodeId: string, input: ReparentHierarchyNodeDto) => Promise<AgentGraphNode | null>;
    },
    private readonly policyResolver: AgentPolicyResolverService
  ) {}

  create(tenantId: string, createdBy: string, input: CreateAgentDto) { return this.repo.createAgentWithVersionTx(tenantId, createdBy, input); }
  list(tenantId: string, limit = 50) { return this.repo.listAgents(tenantId, limit); }

  async get(tenantId: string, id: string) { const a = await this.repo.getAgentById(tenantId, id); if (!a) throw new NotFoundException('agent_not_found'); return a; }
  async patch(tenantId: string, id: string, input: PatchAgentDto, updatedBy: string) { const a = await this.repo.patchAgentTx(tenantId, id, input, updatedBy); if (!a) throw new NotFoundException('agent_not_found'); return a; }
  async delete(tenantId: string, id: string, deletedBy: string) { const ok = await this.repo.deleteAgentTx(tenantId, id, deletedBy); if (!ok) throw new NotFoundException('agent_not_found'); return { deleted: true }; }

  async versions(tenantId: string, id: string, limit = 50) { const a = await this.repo.getAgentById(tenantId, id); if (!a) throw new NotFoundException('agent_not_found'); return this.repo.listAgentVersions(tenantId, id, limit); }
  async getEffectivePolicySnapshot(tenantId: string, id: string) {
    return this.policyResolver.resolveEffectivePolicies(tenantId, id);
  }
  async getLatestVersionSnapshot(tenantId: string, id: string) { const v = await this.repo.getLatestAgentVersion(tenantId, id); if (!v) throw new NotFoundException('agent_not_found'); return v; }
  graph(tenantId: string) { return this.repo.getAgentGraph(tenantId); }

  async nodeDetail(tenantId: string, nodeId: string) {
    const node = await this.repo.getHierarchyNodeDetail(tenantId, nodeId);
    if (!node) throw new NotFoundException('hierarchy_node_not_found');
    return node;
  }

  createNode(tenantId: string, input: HierarchyNodeDto) {
    if (input.level === 'agent') {
      throw new BadRequestException('agent_nodes_are_created_with_agents_endpoint');
    }
    return this.repo.createHierarchyNodeTx(tenantId, input);
  }

  async patchNode(tenantId: string, nodeId: string, input: PatchHierarchyNodeDto) {
    const node = await this.repo.patchHierarchyNodeTx(tenantId, nodeId, input);
    if (!node) throw new NotFoundException('hierarchy_node_not_found');
    return node;
  }

  async reparentNode(tenantId: string, nodeId: string, input: ReparentHierarchyNodeDto) {
    const node = await this.repo.reparentHierarchyNodeTx(tenantId, nodeId, input);
    if (!node) throw new NotFoundException('hierarchy_node_not_found');
    return node;
  }
}
