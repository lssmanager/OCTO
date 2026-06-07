import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { agents, executions, hierarchyNodes, withTenantTx } from '@octo/database';
import type { OctoJwtPayload } from './types/jwt-payload';

export type AuthPrincipal = {
  tenantId: string;
  userId: string;
  agencyIds?: string[];
  workspaceIds?: string[];
} & Pick<OctoJwtPayload, 'sub'>;

type HierarchyScope = { agencyId?: string | undefined; workspaceId?: string | undefined };

@Injectable()
export class HierarchyAccessService {
  private assertPrincipalScope(principal: AuthPrincipal, scope: HierarchyScope) {
    if (
      scope.agencyId &&
      principal.agencyIds?.length &&
      !principal.agencyIds.includes(scope.agencyId)
    ) {
      throw new ForbiddenException({ code: 'AGENCY_SCOPE_DENIED' });
    }
    if (
      scope.workspaceId &&
      principal.workspaceIds?.length &&
      !principal.workspaceIds.includes(scope.workspaceId)
    ) {
      throw new ForbiddenException({ code: 'WORKSPACE_SCOPE_DENIED' });
    }
  }

  private async resolveHierarchyNodeScope(tx: any, tenantId: string, nodeId: string) {
    const node =
      (
        await tx
          .select()
          .from(hierarchyNodes)
          .where(and(eq(hierarchyNodes.tenantId, tenantId), eq(hierarchyNodes.id, nodeId)))
          .limit(1)
      )[0] ?? null;
    if (!node) throw new NotFoundException({ code: 'HIERARCHY_NODE_NOT_FOUND' });

    const rows = await tx.execute(sql`
      WITH RECURSIVE chain AS (
        SELECT id, level, parent_id
        FROM hierarchy_nodes
        WHERE tenant_id=${tenantId} AND id=${nodeId}
        UNION ALL
        SELECT parent.id, parent.level, parent.parent_id
        FROM hierarchy_nodes parent
        JOIN chain ON chain.parent_id = parent.id
        WHERE parent.tenant_id=${tenantId}
      )
      SELECT id, level FROM chain
    `);

    const chain = ((rows as any).rows ?? []) as Array<{ id: string; level: string }>;
    const agencyId = chain.find((row) => row.level === 'agency')?.id;
    const workspaceId = chain.find((row) => row.level === 'workspace')?.id;
    return { node, agencyId, workspaceId };
  }

  async assertCanAccessHierarchyNode(principal: AuthPrincipal, nodeId: string) {
    const scope = await withTenantTx(principal.tenantId, async (tx) =>
      this.resolveHierarchyNodeScope(tx, principal.tenantId, nodeId)
    );
    this.assertPrincipalScope(principal, scope);
    return scope;
  }

  async assertCanAccessAgent(principal: AuthPrincipal, agentId: string) {
    const row = await withTenantTx(
      principal.tenantId,
      async (tx) =>
        (
          await tx
            .select()
            .from(agents)
            .where(and(eq(agents.tenantId, principal.tenantId), eq(agents.id, agentId)))
            .limit(1)
        )[0] ?? null
    );
    if (!row) throw new NotFoundException({ code: 'AGENT_NOT_FOUND' });

    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const agencyId = typeof metadata['agencyId'] === 'string' ? metadata['agencyId'] : undefined;
    const workspaceId =
      typeof metadata['workspaceId'] === 'string' ? metadata['workspaceId'] : undefined;

    this.assertPrincipalScope(principal, { agencyId, workspaceId });
    return { agent: row, agencyId, workspaceId };
  }

  async assertCanAccessExecution(principal: AuthPrincipal, executionId: string) {
    const row = await withTenantTx(
      principal.tenantId,
      async (tx) =>
        (
          await tx
            .select()
            .from(executions)
            .where(and(eq(executions.tenantId, principal.tenantId), eq(executions.id, executionId)))
            .limit(1)
        )[0] ?? null
    );
    if (!row) throw new NotFoundException({ code: 'EXECUTION_NOT_FOUND' });
    await this.assertCanAccessAgent(principal, row.agentId);
    return { execution: row };
  }

  async assertCanAccessWorkspace(principal: AuthPrincipal, workspaceId: string) {
    if (principal.workspaceIds?.length && !principal.workspaceIds.includes(workspaceId)) {
      throw new ForbiddenException({ code: 'WORKSPACE_SCOPE_DENIED' });
    }
    return { workspaceId, tenantId: principal.tenantId };
  }

  async assertCanAccessAgency(principal: AuthPrincipal, agencyId: string) {
    if (principal.agencyIds?.length && !principal.agencyIds.includes(agencyId)) {
      throw new ForbiddenException({ code: 'AGENCY_SCOPE_DENIED' });
    }
    return { agencyId, tenantId: principal.tenantId };
  }
}
