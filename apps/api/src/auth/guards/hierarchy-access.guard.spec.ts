import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { HierarchyAccessGuard } from './hierarchy-access.guard';

function ctx(req: any, cfg: any) {
  const reflector = { getAllAndOverride: () => cfg } as unknown as Reflector;
  const guard = new HierarchyAccessGuard(reflector);
  const context: any = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  };
  return { guard, context };
}

describe('HierarchyAccessGuard', () => {
  it('allows request inside agency/workspace claims', () => {
    const { guard, context } = ctx(
      {
        user: { tenant_id: 't1', agency_ids: ['a1'], workspace_ids: ['w1'] },
        body: { metadata: { agencyId: 'a1', workspaceId: 'w1' } },
      },
      { agencyIdPath: 'metadata.agencyId', workspaceIdPath: 'metadata.workspaceId' }
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies request outside agency claims', () => {
    const { guard, context } = ctx(
      {
        user: { tenant_id: 't1', agency_ids: ['a2'], workspace_ids: ['w1'] },
        body: { metadata: { agencyId: 'a1', workspaceId: 'w1' } },
      },
      { agencyIdPath: 'metadata.agencyId', workspaceIdPath: 'metadata.workspaceId' }
    );
    expect(() => guard.canActivate(context)).toThrow();
  });
});
