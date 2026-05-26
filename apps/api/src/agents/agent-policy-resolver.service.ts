import { Injectable, NotFoundException } from '@nestjs/common';

export type EffectiveAgentPolicySnapshot = {
  agentId: string;
  agentVersion: number;
  workspaceId: string;
  instructions: string;
  modelPolicy: { primaryModel: string; fallbackModels: string[] };
  toolPolicy: { allow: string[]; deny: string[] };
  budgetPolicy: { maxUsdPerRun: string; maxUsdPerDay: string };
  hierarchySnapshot: { workspace: Record<string, unknown>; agent: Record<string, unknown> };
  schemaVersion: 1;
  resolvedAt: string;
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

@Injectable()
export class AgentPolicyResolverService {
  constructor(
    private readonly repo: {
      getAgentLocalConfig: (tenantId: string, agentId: string) => Promise<Record<string, unknown> | null>;
      getWorkspacePolicyDefaults: (tenantId: string, workspaceId: string) => Promise<Record<string, unknown> | null>;
      getAgentVersion: (tenantId: string, agentId: string) => Promise<number | null>;
    }
  ) {}

  async resolveEffectivePolicies(tenantId: string, agentId: string): Promise<EffectiveAgentPolicySnapshot> {
    const local = await this.repo.getAgentLocalConfig(tenantId, agentId);
    if (!local) throw new NotFoundException('agent_not_found');
    const workspaceId = String((local as any)['workspaceId'] ?? '');
    const base = (await this.repo.getWorkspacePolicyDefaults(tenantId, workspaceId)) ?? {};
    const version = (await this.repo.getAgentVersion(tenantId, agentId)) ?? 1;

    const primaryModel = String(((local as any)['modelPolicy'] as any)?.primaryModel ?? (base as any)?.modelPolicy?.primaryModel ?? '');
    const fallbackModels = unique([
      ...(((base as any)?.modelPolicy?.fallbackModels ?? []) as string[]),
      ...((((local as any)['modelPolicy'] as any)?.fallbackModels ?? []) as string[]),
    ]).filter((m) => m !== primaryModel);

    const allow = unique([
      ...(((base as any)?.toolPolicy?.allow ?? []) as string[]),
      ...((((local as any).toolPolicy?.allow ?? []) as string[])),
    ]);
    const deny = unique([
      ...(((base as any)?.toolPolicy?.deny ?? []) as string[]),
      ...((((local as any).toolPolicy?.deny ?? []) as string[])),
    ]);

    return {
      agentId,
      agentVersion: version,
      workspaceId,
      instructions: String((local as any)['instructions'] ?? ''),
      modelPolicy: { primaryModel, fallbackModels },
      toolPolicy: { allow: allow.filter((t) => !deny.includes(t)), deny },
      budgetPolicy: {
        maxUsdPerRun: String((local as any)['budgetPolicy']?.maxUsdPerRun ?? (base as any)?.budgetPolicy?.maxUsdPerRun ?? '0'),
        maxUsdPerDay: String((local as any)['budgetPolicy']?.maxUsdPerDay ?? (base as any)?.budgetPolicy?.maxUsdPerDay ?? '0'),
      },
      hierarchySnapshot: { workspace: base, agent: local },
      schemaVersion: 1,
      resolvedAt: new Date().toISOString(),
    };
  }
}
