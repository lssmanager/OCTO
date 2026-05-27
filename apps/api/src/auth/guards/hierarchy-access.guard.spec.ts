import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { HierarchyAccessGuard } from './hierarchy-access.guard';

function ctx(req: any, cfg: any) {
  const reflector = { getAllAndOverride: () => cfg } as unknown as Reflector;
  const hierarchy = {
    assertCanAccessExecution: async () => ({ ok: true }),
    assertCanAccessAgent: async () => ({ ok: true }),
    assertCanAccessWorkspace: async () => ({ ok: true }),
    assertCanAccessAgency: async () => ({ ok: true }),
  } as any;
  const guard = new HierarchyAccessGuard(reflector, hierarchy);
  const context: any = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  };
  return { guard, context };
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
});
