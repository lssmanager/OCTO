import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { HierarchyActivationState, HierarchyLevel } from '@octo/contracts';

export type PolicyConfig = {
  instructions?: string;
  modelPolicy?: { primaryModel?: string; fallbackModels?: string[]; allowedModels?: string[]; registeredModels?: string[] };
  fallbackModels?: string[];
  toolPolicy?: { allow?: string[]; deny?: string[] };
  budgetPolicy?: Record<string, unknown>;
  governance?: Record<string, unknown>;
};

export type HierarchyPolicyNode = {
  id: string;
  level: HierarchyLevel;
  parentId: string | null;
  activationState: HierarchyActivationState;
  config: PolicyConfig;
};

export type EffectiveAgentPolicySnapshot = {
  agentId: string;
  agentVersion: number;
  workspaceId: string;
  subagentId?: string;
  instructions: string;
  modelPolicy: { primaryModel: string; fallbackModels: string[]; fallbackChain: string[]; allowedModels: string[]; registeredModels: string[] };
  toolPolicy: { allow: string[]; deny: string[] };
  budgetPolicy: Record<string, unknown>;
  governance: Record<string, unknown>;
  hierarchySnapshot: {
    chain: HierarchyPolicyNode[];
    agency?: HierarchyPolicyNode;
    department?: HierarchyPolicyNode;
    workspace?: HierarchyPolicyNode;
    agent?: HierarchyPolicyNode;
    subagent?: HierarchyPolicyNode;
  };
  schemaVersion: 2;
  resolvedAt: string;
};

const PARENT_BY_LEVEL: Record<HierarchyLevel, HierarchyLevel | null> = {
  agency: null,
  department: 'agency',
  workspace: 'department',
  agent: 'workspace',
  subagent: 'agent',
};

export function validateHierarchyRelation(parentLevel: HierarchyLevel | null, childLevel: HierarchyLevel): void {
  const expected = PARENT_BY_LEVEL[childLevel];
  if (expected !== parentLevel) {
    throw new BadRequestException(`invalid_hierarchy_parent:${parentLevel ?? 'null'}->${childLevel}`);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function configOf(value: Record<string, unknown> | null | undefined): PolicyConfig {
  return ((value as any)?.configJson ?? value ?? {}) as PolicyConfig;
}

function mergeObjects(chain: PolicyConfig[], key: 'budgetPolicy' | 'governance'): Record<string, unknown> {
  return chain.reduce<Record<string, unknown>>((acc, config) => ({ ...acc, ...((config[key] as Record<string, unknown> | undefined) ?? {}) }), {});
}

@Injectable()
export class AgentPolicyResolverService {
  constructor(
    private readonly repo: {
      getAgentLocalConfig: (tenantId: string, agentId: string) => Promise<Record<string, unknown> | null>;
      getHierarchyPolicyChain?: (tenantId: string, agentId: string) => Promise<HierarchyPolicyNode[] | null>;
      getWorkspacePolicyDefaults: (tenantId: string, workspaceId: string) => Promise<Record<string, unknown> | null>;
      getAgentVersion: (tenantId: string, agentId: string) => Promise<number | null>;
    }
  ) {}

  async resolveEffectivePolicies(tenantId: string, agentId: string): Promise<EffectiveAgentPolicySnapshot> {
    const local = configOf(await this.repo.getAgentLocalConfig(tenantId, agentId));
    if (!local || Object.keys(local).length === 0) throw new NotFoundException('agent_not_found');

    const chain = (await this.repo.getHierarchyPolicyChain?.(tenantId, agentId)) ?? [];
    const workspaceId = String((local as any).workspaceId ?? chain.find((node) => node.level === 'workspace')?.id ?? '');
    const workspaceDefaults = configOf(await this.repo.getWorkspacePolicyDefaults(tenantId, workspaceId));
    const effectiveChain: PolicyConfig[] = [workspaceDefaults, ...chain.map((node) => node.config), local];
    const version = (await this.repo.getAgentVersion(tenantId, agentId)) ?? 1;

    const primaryModel = [...effectiveChain]
      .reverse()
      .map((config) => config.modelPolicy?.primaryModel)
      .find((model): model is string => typeof model === 'string' && model.length > 0) ?? '';

    const fallbackModels = unique(
      effectiveChain.flatMap((config) => [
        ...asStringArray(config.modelPolicy?.fallbackModels),
        ...asStringArray(config.fallbackModels),
      ])
    ).filter((model) => model !== primaryModel);
    const allowedModels = unique(effectiveChain.flatMap((config) => asStringArray(config.modelPolicy?.allowedModels)));
    const registeredModels = unique(effectiveChain.flatMap((config) => asStringArray(config.modelPolicy?.registeredModels)));
    const fallbackChain = fallbackModels.filter((model) => {
      if (registeredModels.length > 0 && !registeredModels.includes(model)) return false;
      if (allowedModels.length > 0 && !allowedModels.includes(model)) return false;
      return true;
    });
    if (primaryModel && registeredModels.length > 0 && !registeredModels.includes(primaryModel)) {
      throw new BadRequestException(`model_not_registered:${primaryModel}`);
    }
    if (primaryModel && allowedModels.length > 0 && !allowedModels.includes(primaryModel)) {
      throw new BadRequestException(`model_not_allowed:${primaryModel}`);
    }

    const deny = unique(effectiveChain.flatMap((config) => asStringArray(config.toolPolicy?.deny)));
    const allow = unique(effectiveChain.flatMap((config) => asStringArray(config.toolPolicy?.allow))).filter(
      (tool) => !deny.includes(tool)
    );
    const hierarchyByLevel: Omit<EffectiveAgentPolicySnapshot['hierarchySnapshot'], 'chain'> = {};
    for (const node of chain) hierarchyByLevel[node.level as keyof typeof hierarchyByLevel] = node;
    const subagent = chain.find((node) => node.level === 'subagent');

    return {
      agentId,
      agentVersion: version,
      workspaceId,
      ...(subagent ? { subagentId: subagent.id } : {}),
      instructions: String([...effectiveChain].reverse().find((config) => typeof config.instructions === 'string')?.instructions ?? ''),
      modelPolicy: { primaryModel, fallbackModels: fallbackChain, fallbackChain, allowedModels, registeredModels },
      toolPolicy: { allow, deny },
      budgetPolicy: mergeObjects(effectiveChain, 'budgetPolicy'),
      governance: mergeObjects(effectiveChain, 'governance'),
      hierarchySnapshot: { ...hierarchyByLevel, chain },
      schemaVersion: 2,
      resolvedAt: new Date().toISOString(),
    };
  }
}
