import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AgentService } from './agent.service';
import { PostgresAgentRepo } from './postgres-agent.repo';

function build(overrides?: Partial<any>) {
  const repo = {
    createAgentWithVersionTx: vi.fn(async () => ({ id: 'a1' })),
    listAgents: vi.fn(async () => [{ id: 'a1' }]),
    getAgentById: vi.fn(async () => ({ id: 'a1' })),
    patchAgentTx: vi.fn(async () => ({ id: 'a1' })),
    deleteAgentTx: vi.fn(async () => true),
    listAgentVersions: vi.fn(async () => [{ id: 'v1', version: 1 }]),
    getLatestAgentVersion: vi.fn(async () => ({ id: 'v1' })),
    resolveEffectivePolicySnapshot: vi.fn(async () => ({ maxSteps: 10 })),
    getAgentGraph: vi.fn(async () => [{ id: 'n1' }]),
    getHierarchyNodeDetail: vi.fn(async () => ({ id: 'n1' })),
    createHierarchyNodeTx: vi.fn(async () => ({ id: 'n2' })),
    patchHierarchyNodeTx: vi.fn(async () => ({ id: 'n1' })),
    reparentHierarchyNodeTx: vi.fn(async () => ({ id: 'n1' })),
    ...overrides,
  };
  const policy = { resolveEffectivePolicies: vi.fn(async () => ({ agentId: "a1" })) };
  return { svc: new AgentService(repo, policy as any), repo, policy };
}

describe('AgentService', () => {
  it('crud+versions happy path', async () => {
    const { svc, repo } = build();
    await expect(svc.create('t1','u1',{name:'n',role:'r',goal:'g'})).resolves.toEqual({ id: 'a1' });
    await expect(svc.list('t1')).resolves.toHaveLength(1);
    await expect(svc.get('t1','a1')).resolves.toEqual({ id: 'a1' });
    await expect(svc.patch('t1','a1',{name:'x'},'u1')).resolves.toEqual({ id: 'a1' });
    await expect(svc.delete('t1','a1','u1')).resolves.toEqual({ deleted: true });
    await expect(svc.versions('t1','a1')).resolves.toHaveLength(1);
    await expect(svc.graph('t1', { workspaceIds: ['w1'] })).resolves.toHaveLength(1);
    expect(repo.getAgentGraph).toHaveBeenCalledWith('t1', { workspaceIds: ['w1'] });
    await expect(svc.nodeDetail('t1','n1')).resolves.toEqual({ id: 'n1' });
    await expect(svc.createNode('t1',{ name: 'Agency', level: 'agency' })).resolves.toEqual({ id: 'n2' });
    await expect(svc.patchNode('t1','n1',{ name: 'Agency 2' })).resolves.toEqual({ id: 'n1' });
    await expect(svc.reparentNode('t1','n1',{ parentId: null })).resolves.toEqual({ id: 'n1' });
  });


  it('filters graph results to requested hierarchy scopes', async () => {
    const now = new Date();
    const nodes = [
      { id: 'agency-1', tenantId: 't1', level: 'agency', name: 'Agency 1', slug: 'agency-1', parentId: null, activationState: 'active', createdAt: now, updatedAt: now },
      { id: 'dept-1', tenantId: 't1', level: 'department', name: 'Dept 1', slug: 'dept-1', parentId: 'agency-1', activationState: 'active', createdAt: now, updatedAt: now },
      { id: 'workspace-1', tenantId: 't1', level: 'workspace', name: 'Workspace 1', slug: 'workspace-1', parentId: 'dept-1', activationState: 'active', createdAt: now, updatedAt: now },
      { id: 'agent-node-1', tenantId: 't1', level: 'agent', name: 'Agent Node 1', slug: 'agent-node-1', parentId: 'workspace-1', activationState: 'active', createdAt: now, updatedAt: now },
      { id: 'workspace-2', tenantId: 't1', level: 'workspace', name: 'Workspace 2', slug: 'workspace-2', parentId: 'dept-1', activationState: 'active', createdAt: now, updatedAt: now },
      { id: 'agent-node-2', tenantId: 't1', level: 'agent', name: 'Agent Node 2', slug: 'agent-node-2', parentId: 'workspace-2', activationState: 'active', createdAt: now, updatedAt: now },
    ];
    const agents = [
      { id: 'agent-1', tenantId: 't1', hierarchyNodeId: 'agent-node-1', name: 'Agent 1', role: 'operator', goal: 'scoped', status: 'ready', capabilities: ['scoped'], governancePolicy: {}, metadata: {} },
      { id: 'agent-2', tenantId: 't1', hierarchyNodeId: 'agent-node-2', name: 'Agent 2', role: 'operator', goal: 'hidden', status: 'ready', capabilities: ['hidden'], governancePolicy: {}, metadata: {} },
    ];
    let selectCount = 0;
    const tx = { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => (selectCount++ === 0 ? nodes : agents)) })) })) };
    const graph = await (new PostgresAgentRepo() as any).buildGraph(tx, 't1', { workspaceIds: ['workspace-1'] });
    const flat = graph.flatMap(function walk(node: any): any[] { return [node, ...node.children.flatMap(walk)]; });
    expect(flat.map((node) => node.id)).toEqual(['workspace-1', 'agent-node-1']);
    expect(flat[1].agent.id).toBe('agent-1');
  });

  it('returns 404 semantics', async () => {
    const { svc } = build({ getAgentById: vi.fn(async () => null) });
    await expect(svc.get('t1','missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.versions('t1','missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});


