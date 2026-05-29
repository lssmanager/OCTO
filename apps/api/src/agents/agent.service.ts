import { Injectable, NotFoundException } from '@nestjs/common';
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

export type CreateAgentDto = {
  name: string;
  description?: string;
  role: string;
  goal: string;
  parentId?: string | null;
  capabilities?: unknown;
  governancePolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  hierarchyLevel?: 'agent' | 'subagent';
  hierarchyParentId?: string | null;
  activationState?: 'active' | 'inactive' | 'suspended' | 'archived';
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
}
