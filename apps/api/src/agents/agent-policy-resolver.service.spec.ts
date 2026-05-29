import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AgentPolicyResolverService, validateHierarchyRelation, type HierarchyPolicyNode } from './agent-policy-resolver.service';

const baseChain: HierarchyPolicyNode[] = [
  {
    id: 'agency-1',
    level: 'agency',
    parentId: null,
    activationState: 'active',
    config: {
      modelPolicy: { primaryModel: 'agency/model', fallbackModels: ['agency/fallback'] },
      toolPolicy: { allow: ['search'], deny: [] },
      budgetPolicy: { maxUsdPerRun: '10' },
      governance: { audit: true },
    },
  },
  {
    id: 'department-1',
    level: 'department',
    parentId: 'agency-1',
    activationState: 'active',
    config: { toolPolicy: { allow: ['crm'] } },
  },
  {
    id: 'workspace-1',
    level: 'workspace',
    parentId: 'department-1',
    activationState: 'active',
    config: {},
  },
  {
    id: 'agent-node-1',
    level: 'agent',
    parentId: 'workspace-1',
    activationState: 'active',
    config: {},
  },
];

function resolver(localConfig: Record<string, unknown>, chain: HierarchyPolicyNode[]) {
  return new AgentPolicyResolverService({
    getAgentLocalConfig: async () => localConfig,
    getHierarchyPolicyChain: async () => chain,
    getWorkspacePolicyDefaults: async () => ({}),
    getAgentVersion: async () => 3,
  });
}

describe('AgentPolicyResolverService hierarchy resolution', () => {
  it('inherits policies without overrides', async () => {
    const got = await resolver({ instructions: 'run', workspaceId: 'workspace-1' }, baseChain).resolveEffectivePolicies('tenant-1', 'agent-1');

    expect(got.modelPolicy.primaryModel).toBe('agency/model');
    expect(got.modelPolicy.fallbackModels).toEqual(['agency/fallback']);
    expect(got.toolPolicy.allow).toEqual(['search', 'crm']);
    expect(got.budgetPolicy).toMatchObject({ maxUsdPerRun: '10' });
    expect(got.governance).toMatchObject({ audit: true });
  });

  it('applies workspace override over agency and department', async () => {
    const chain = baseChain.map((node) => node.level === 'workspace' ? { ...node, config: { modelPolicy: { primaryModel: 'workspace/model' }, budgetPolicy: { maxUsdPerRun: '3' } } } : node);
    const got = await resolver({ workspaceId: 'workspace-1' }, chain).resolveEffectivePolicies('tenant-1', 'agent-1');

    expect(got.modelPolicy.primaryModel).toBe('workspace/model');
    expect(got.budgetPolicy).toMatchObject({ maxUsdPerRun: '3' });
  });

  it('applies agent override over workspace', async () => {
    const chain = baseChain.map((node) => node.level === 'workspace' ? { ...node, config: { modelPolicy: { primaryModel: 'workspace/model' } } } : node);
    const got = await resolver({ workspaceId: 'workspace-1', modelPolicy: { primaryModel: 'agent/model', fallbackModels: ['agent/fallback'] } }, chain).resolveEffectivePolicies('tenant-1', 'agent-1');

    expect(got.modelPolicy.primaryModel).toBe('agent/model');
    expect(got.modelPolicy.fallbackModels).toEqual(['agency/fallback', 'agent/fallback']);
  });

  it('applies subagent override over agent', async () => {
    const chain: HierarchyPolicyNode[] = [
      ...baseChain.slice(0, -1),
      { ...baseChain[3]!, config: { modelPolicy: { primaryModel: 'agent/model' } } },
      { id: 'subagent-1', level: 'subagent', parentId: 'agent-node-1', activationState: 'active', config: { modelPolicy: { primaryModel: 'subagent/model' }, toolPolicy: { deny: ['crm'] } } },
    ];
    const got = await resolver({ workspaceId: 'workspace-1' }, chain).resolveEffectivePolicies('tenant-1', 'agent-1');

    expect(got.modelPolicy.primaryModel).toBe('subagent/model');
    expect(got.toolPolicy.allow).toEqual(['search']);
    expect(got.subagentId).toBe('subagent-1');
  });

  it('rejects invalid parent/child relationships', () => {
    expect(() => validateHierarchyRelation('agency', 'agent')).toThrow(BadRequestException);
  });

  it('reads configJson-shaped local config correctly', async () => {
    const got = await resolver({ configJson: { workspaceId: 'workspace-1', modelPolicy: { primaryModel: 'agent/config-json' } } }, baseChain).resolveEffectivePolicies('tenant-1', 'agent-1');

    expect(got.modelPolicy.primaryModel).toBe('agent/config-json');
  });
});
