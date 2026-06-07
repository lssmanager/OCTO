import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { HierarchyAccessGuard } from './hierarchy-access.guard';

function ctx(req: any, cfg: any, overrides: Partial<Record<string, any>> = {}) {
  const reflector = { getAllAndOverride: () => cfg } as unknown as Reflector;
  const hierarchy = {
    assertCanAccessExecution: async () => ({ ok: true }),
    assertCanAccessAgent: async () => ({ ok: true }),
    assertCanAccessHierarchyNode: async (_principal: unknown, nodeId: string) => ({ nodeId }),
    assertCanAccessWorkspace: async () => ({ ok: true }),
    assertCanAccessAgency: async () => ({ ok: true }),
    ...overrides,
  } as any;
  const guard = new HierarchyAccessGuard(reflector, hierarchy);
  const context: any = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  };
  return { guard, context, hierarchy };
}

describe('HierarchyAccessGuard', () => {
  it('allows request inside agency/workspace claims', async () => {
    const { guard, context } = ctx(
      {
        user: { tenant_id: 't1', agency_ids: ['a1'], workspace_ids: ['w1'] },
        body: { metadata: { agencyId: 'a1', workspaceId: 'w1' } },
      },
      { agencyIdPath: 'metadata.agencyId', workspaceIdPath: 'metadata.workspaceId' }
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies request outside agency claims', async () => {
    const { guard, context } = ctx(
      {
        user: { tenant_id: 't1', agency_ids: ['a2'], workspace_ids: ['w1'] },
        body: { metadata: { agencyId: 'a1', workspaceId: 'w1' } },
      },
      { agencyIdPath: 'metadata.agencyId', workspaceIdPath: 'metadata.workspaceId' }
    );
    await expect(guard.canActivate(context)).rejects.toThrow();
  });

  it('prefers route params over body for overlapping ids', async () => {
    const req = {
      user: { tenant_id: 't1' },
      params: { id: 'route-id' },
      body: { id: 'body-id' },
    };
    const reflector = { getAllAndOverride: () => ({ executionIdPath: 'id' }) } as unknown as Reflector;
    const hierarchy = {
      assertCanAccessExecution: async (_principal: unknown, executionId: string) => ({ executionId }),
      assertCanAccessAgent: async () => ({ ok: true }),
      assertCanAccessHierarchyNode: async () => ({ ok: true }),
      assertCanAccessWorkspace: async () => ({ ok: true }),
      assertCanAccessAgency: async () => ({ ok: true }),
    } as any;
    const guard = new HierarchyAccessGuard(reflector, hierarchy);
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.hierarchyContext).toEqual({ executionId: 'route-id' });
  });

  it('uses hierarchy node access when node metadata is declared', async () => {
    const assertCanAccessHierarchyNode = vi.fn(async (_principal: unknown, id: string) => ({ nodeId: id }));
    const { guard, context } = ctx(
      {
        user: { tenant_id: 't1', agency_ids: ['a1'] },
        params: { nodeId: 'route-node' },
        body: { nodeId: 'body-node' },
      },
      { nodeIdPath: 'nodeId' },
      { assertCanAccessHierarchyNode }
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(assertCanAccessHierarchyNode).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1' }), 'route-node');
  });

  it('checks both source node and destination parent on reparent', async () => {
    const assertCanAccessHierarchyNode = vi.fn(async (_principal: unknown, id: string) => ({ nodeId: id }));
    const req = {
      user: { tenant_id: 't1' },
      params: { nodeId: 'node-1' },
      body: { parentId: 'parent-2' },
    };
    const { guard, context } = ctx(req, { nodeIdPath: 'nodeId', parentNodeIdPath: 'parentId' }, { assertCanAccessHierarchyNode });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(assertCanAccessHierarchyNode).toHaveBeenNthCalledWith(1, expect.objectContaining({ tenantId: 't1' }), 'node-1');
    expect(assertCanAccessHierarchyNode).toHaveBeenNthCalledWith(2, expect.objectContaining({ tenantId: 't1' }), 'parent-2');
    expect(req.hierarchyContext).toEqual({
      node: { nodeId: 'node-1' },
      parentNode: { nodeId: 'parent-2' },
    });
  });
});
