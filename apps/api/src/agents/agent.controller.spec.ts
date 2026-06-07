import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AgentController } from './agent.controller';
import { HIERARCHY_CONTEXT_KEY } from '../auth/decorators/hierarchy-context.decorator';

describe('AgentController', () => {
  it('propagates tenant/user from principal', async () => {
    const service = {
      create: vi.fn(async () => ({})),
      list: vi.fn(async () => []),
      get: vi.fn(async () => ({})),
      patch: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({ deleted: true })),
      versions: vi.fn(async () => []),
      graph: vi.fn(async () => []),
      nodeDetail: vi.fn(async () => ({})),
      createNode: vi.fn(async () => ({})),
      patchNode: vi.fn(async () => ({})),
      reparentNode: vi.fn(async () => ({})),
    } as any;
    const c = new AgentController(service);
    const req = { user: { tenantId: 'tenant-1', sub: 'user-1' } };
    await c.create({ name: 'n', role: 'r', goal: 'g' }, req);
    await c.list(req, '25');
    await c.get('a1', req);
    await c.patch('a1', { name: 'x' }, req);
    await c.delete('a1', req);
    await c.versions('a1', req, '10');
    await c.graph(req);
    await c.nodeDetail('n1', req);
    await c.createNode({ name: 'Agency', level: 'agency' }, req);
    await c.patchNode('n1', { name: 'Agency 2' }, req);
    await c.reparentNode('n1', { parentId: null }, req);
    expect(service.create).toHaveBeenCalledWith('tenant-1', 'user-1', expect.anything());
    expect(service.list).toHaveBeenCalledWith('tenant-1', 25);
    expect(service.versions).toHaveBeenCalledWith('tenant-1', 'a1', 10);
    expect(service.graph).toHaveBeenCalledWith('tenant-1', { agencyIds: undefined, workspaceIds: undefined });
    expect(service.createNode).toHaveBeenCalledWith('tenant-1', expect.anything());
  });

  it('propagates hierarchy scope from jwt principal', async () => {
    const service = { graph: vi.fn(async () => []) } as any;
    const c = new AgentController(service);
    await c.graph({ user: { tenant_id: 'tenant-1', sub: 'user-1', agency_ids: ['agency-1'], workspace_ids: ['workspace-1'] } } as any);
    expect(service.graph).toHaveBeenCalledWith('tenant-1', { agencyIds: ['agency-1'], workspaceIds: ['workspace-1'] });
  });

  it('declares hierarchy metadata for node endpoints', () => {
    expect(Reflect.getMetadata(HIERARCHY_CONTEXT_KEY, AgentController.prototype.nodeDetail)).toEqual({ nodeIdPath: 'nodeId' });
    expect(Reflect.getMetadata(HIERARCHY_CONTEXT_KEY, AgentController.prototype.createNode)).toEqual({ parentNodeIdPath: 'parentId' });
    expect(Reflect.getMetadata(HIERARCHY_CONTEXT_KEY, AgentController.prototype.patchNode)).toEqual({ nodeIdPath: 'nodeId' });
    expect(Reflect.getMetadata(HIERARCHY_CONTEXT_KEY, AgentController.prototype.reparentNode)).toEqual({
      nodeIdPath: 'nodeId',
      parentNodeIdPath: 'parentId',
    });
  });

  it('throws when principal missing', async () => {
    const service = { create: vi.fn() } as any;
    const c = new AgentController(service);
    expect(() => c.create({ name: 'n', role: 'r', goal: 'g' }, {} as any)).toThrow();
  });
});
