import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AgentService } from './agent.service';

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
    ...overrides,
  };
  const policy = { resolveEffectivePolicies: vi.fn(async () => ({ agentId: "a1" })) };
  return { svc: new AgentService(repo, policy as any), repo, policy };
}

describe('AgentService', () => {
  it('crud+versions happy path', async () => {
    const { svc } = build();
    await expect(svc.create('t1','u1',{name:'n',role:'r',goal:'g'})).resolves.toEqual({ id: 'a1' });
    await expect(svc.list('t1')).resolves.toHaveLength(1);
    await expect(svc.get('t1','a1')).resolves.toEqual({ id: 'a1' });
    await expect(svc.patch('t1','a1',{name:'x'},'u1')).resolves.toEqual({ id: 'a1' });
    await expect(svc.delete('t1','a1','u1')).resolves.toEqual({ deleted: true });
    await expect(svc.versions('t1','a1')).resolves.toHaveLength(1);
  });

  it('returns 404 semantics', async () => {
    const { svc } = build({ getAgentById: vi.fn(async () => null) });
    await expect(svc.get('t1','missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.versions('t1','missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});


