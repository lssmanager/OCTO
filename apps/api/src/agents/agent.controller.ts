import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AgentService, type CreateAgentDto, type HierarchyNodeDto, type PatchAgentDto, type PatchHierarchyNodeDto, type ReparentHierarchyNodeDto } from './agent.service';
import type { Principal } from '../auth/types/principal';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/guards/tenant-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { HierarchyAccessGuard } from '../auth/guards/hierarchy-access.guard';
import { Public as PublicApiRoute } from '../admin/internal-secret.guard';
import { HierarchyContextMeta } from '../auth/decorators/hierarchy-context.decorator';
import type { OctoRequest } from '../auth/types/octo-request';
import type { OctoJwtPayload } from '../auth/types/jwt-payload';

function mustPrincipal(req: OctoRequest & { user?: Principal | OctoJwtPayload }): Principal {
  const user = req.user;
  const tenantId = req.tenantId ?? (user && 'tenantId' in user ? user.tenantId : undefined) ?? (user && 'tenant_id' in user ? user.tenant_id : undefined);
  const sub = req.userId ?? user?.sub;
  if (!tenantId || !sub) throw new UnauthorizedException('unauthorized');
  const agencyIds = user && 'agencyIds' in user ? user.agencyIds : user && 'agency_ids' in user ? user.agency_ids : undefined;
  const workspaceIds = user && 'workspaceIds' in user ? user.workspaceIds : user && 'workspace_ids' in user ? user.workspace_ids : undefined;
  return { tenantId, sub, ...(agencyIds ? { agencyIds } : {}), ...(workspaceIds ? { workspaceIds } : {}) };
}

function parseLimit(limit?: string): number {
  if (!limit) return 50;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 200) throw new BadRequestException('invalid_limit');
  return n;
}

@Controller('/v1/agents')
@PublicApiRoute()
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard, HierarchyAccessGuard)
export class AgentController {
  constructor(private readonly service: AgentService) {}

  @Post()
  @RequireScopes('agents:write')
  @HierarchyContextMeta({ agencyIdPath: 'metadata.agencyId', workspaceIdPath: 'metadata.workspaceId' })
  create(@Body() body: CreateAgentDto, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.create(p.tenantId, p.sub, body);
  }

  @Get('graph')
  @RequireScopes('agents:read')
  graph(@Req() req: OctoRequest & { user?: Principal | OctoJwtPayload }) {
    const p = mustPrincipal(req);
    return this.service.graph(p.tenantId, { agencyIds: p.agencyIds, workspaceIds: p.workspaceIds });
  }

  @Get('nodes/:nodeId')
  @RequireScopes('agents:read')
  nodeDetail(@Param('nodeId') nodeId: string, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.nodeDetail(p.tenantId, nodeId);
  }

  @Post('nodes')
  @RequireScopes('agents:write')
  createNode(@Body() body: HierarchyNodeDto, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.createNode(p.tenantId, body);
  }

  @Patch('nodes/:nodeId')
  @RequireScopes('agents:write')
  patchNode(@Param('nodeId') nodeId: string, @Body() body: PatchHierarchyNodeDto, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.patchNode(p.tenantId, nodeId, body);
  }

  @Patch('nodes/:nodeId/parent')
  @RequireScopes('agents:write')
  reparentNode(@Param('nodeId') nodeId: string, @Body() body: ReparentHierarchyNodeDto, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.reparentNode(p.tenantId, nodeId, body);
  }

  @Get()
  @RequireScopes('agents:read')
  list(@Req() req: OctoRequest & { user?: Principal }, @Query('limit') limit?: string) {
    const p = mustPrincipal(req);
    return this.service.list(p.tenantId, parseLimit(limit));
  }

  @Get(':id')
  @RequireScopes('agents:read')
  @HierarchyContextMeta({ agentIdPath: 'id' })
  get(@Param('id') id: string, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.get(p.tenantId, id);
  }

  @Patch(':id')
  @RequireScopes('agents:write')
  @HierarchyContextMeta({ agentIdPath: 'id' })
  patch(@Param('id') id: string, @Body() body: PatchAgentDto, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.patch(p.tenantId, id, body, p.sub);
  }

  @Delete(':id')
  @RequireScopes('agents:write')
  @HierarchyContextMeta({ agentIdPath: 'id' })
  delete(@Param('id') id: string, @Req() req: OctoRequest & { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.delete(p.tenantId, id, p.sub);
  }

  @Get(':id/versions')
  @RequireScopes('agents:read')
  @HierarchyContextMeta({ agentIdPath: 'id' })
  versions(
    @Param('id') id: string,
    @Req() req: OctoRequest & { user?: Principal },
    @Query('limit') limit?: string
  ) {
    const p = mustPrincipal(req);
    return this.service.versions(p.tenantId, id, parseLimit(limit));
  }
}
