import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HIERARCHY_CONTEXT_KEY, type HierarchyContext } from '../decorators/hierarchy-context.decorator';
import type { OctoRequest } from '../types/octo-request';
import type { OctoJwtPayload } from '../types/jwt-payload';
import { HierarchyAccessService } from '../hierarchy-access.service';

function getByPath(input: Record<string, unknown>, path?: string): string | undefined {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur: unknown = input;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

@Injectable()
export class HierarchyAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly hierarchy: HierarchyAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OctoRequest & { body?: Record<string, unknown>; params?: Record<string, unknown> }>();
    const user = req.user as OctoJwtPayload | undefined;
    if (!user?.tenant_id) throw new ForbiddenException({ code: 'TENANT_CONTEXT_MISSING' });

    const cfg = this.reflector.getAllAndOverride<HierarchyContext>(HIERARCHY_CONTEXT_KEY, [context.getHandler(), context.getClass()]) ?? {};
    const bag = { ...(req.params ?? {}), ...(req.body ?? {}) };
    const agencyId = getByPath(bag, cfg.agencyIdPath);
    const workspaceId = getByPath(bag, cfg.workspaceIdPath);
    const agentId = getByPath(bag, cfg.agentIdPath);
    const executionId = getByPath(bag, cfg.executionIdPath);

    if (agencyId && user.agency_ids && user.agency_ids.length > 0 && !user.agency_ids.includes(agencyId)) {
      throw new ForbiddenException({ code: 'AGENCY_SCOPE_DENIED' });
    }
    if (workspaceId && user.workspace_ids && user.workspace_ids.length > 0 && !user.workspace_ids.includes(workspaceId)) {
      throw new ForbiddenException({ code: 'WORKSPACE_SCOPE_DENIED' });
    }

    const principal = {
      tenantId: user.tenant_id,
      userId: user.sub,
      sub: user.sub,
      ...(user.agency_ids ? { agencyIds: user.agency_ids } : {}),
      ...(user.workspace_ids ? { workspaceIds: user.workspace_ids } : {}),
    };

    if (executionId) {
      req.hierarchyContext = await this.hierarchy.assertCanAccessExecution(principal, executionId);
      return true;
    }
    if (agentId) {
      req.hierarchyContext = await this.hierarchy.assertCanAccessAgent(principal, agentId);
      return true;
    }
    if (workspaceId) {
      req.hierarchyContext = await this.hierarchy.assertCanAccessWorkspace(principal, workspaceId);
      return true;
    }
    if (agencyId) {
      req.hierarchyContext = await this.hierarchy.assertCanAccessAgency(principal, agencyId);
      return true;
    }
    return true;
  }
}
