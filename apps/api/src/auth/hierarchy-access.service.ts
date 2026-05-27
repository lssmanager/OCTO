import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { agents, executions, withTenantTx } from '@octo/database';
import type { OctoJwtPayload } from './types/jwt-payload';

export type AuthPrincipal = {
  tenantId: string;
  userId: string;
  agencyIds?: string[];
  workspaceIds?: string[];
} & Pick<OctoJwtPayload, 'sub'>;

@Injectable()
export class HierarchyAccessService {
  async assertCanAccessAgent(principal: AuthPrincipal, agentId: string) {
    const row = await withTenantTx(principal.tenantId, async (tx) => (
      await tx.select().from(agents).where(and(eq(agents.tenantId, principal.tenantId), eq(agents.id, agentId))).limit(1)
    )[0] ?? null);
    if (!row) throw new NotFoundException({ code: 'AGENT_NOT_FOUND' });

    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const agencyId = typeof metadata['agencyId'] === 'string' ? metadata['agencyId'] : undefined;
    const workspaceId = typeof metadata['workspaceId'] === 'string' ? metadata['workspaceId'] : undefined;

    if (agencyId && principal.agencyIds?.length && !principal.agencyIds.includes(agencyId)) {
      throw new ForbiddenException({ code: 'AGENCY_SCOPE_DENIED' });
    }
    if (workspaceId && principal.workspaceIds?.length && !principal.workspaceIds.includes(workspaceId)) {
      throw new ForbiddenException({ code: 'WORKSPACE_SCOPE_DENIED' });
    }
    return { agent: row, agencyId, workspaceId };
  }

  async assertCanAccessExecution(principal: AuthPrincipal, executionId: string) {
    const row = await withTenantTx(principal.tenantId, async (tx) => (
      await tx.select().from(executions).where(and(eq(executions.tenantId, principal.tenantId), eq(executions.id, executionId))).limit(1)
    )[0] ?? null);
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
