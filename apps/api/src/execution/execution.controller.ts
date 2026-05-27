import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ExecutionControllerService,
  type CreateExecutionRequest,
} from './execution-controller.service';
import type { Principal } from '../auth/types/principal';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/guards/tenant-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { HierarchyAccessGuard } from '../auth/guards/hierarchy-access.guard';
import { HierarchyContextMeta } from '../auth/decorators/hierarchy-context.decorator';
import type { OctoRequest } from '../auth/types/octo-request';

function requirePrincipal(req: OctoRequest & { user?: Principal }): Principal {
  const tenantId = req.tenantId ?? req.user?.tenantId;
  const sub = req.userId ?? req.user?.sub;
  if (!tenantId || !sub) {
    throw new UnauthorizedException('UNAUTHORIZED');
  }
  return { tenantId, sub };
}

@Controller('/v1/executions')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard, HierarchyAccessGuard)
export class ExecutionController {
  constructor(private readonly service: ExecutionControllerService) {}

  @Post()
  @RequireScopes('executions:write')
  @HierarchyContextMeta({ agencyIdPath: 'agencyId', workspaceIdPath: 'workspaceId' })
  create(@Body() body: CreateExecutionRequest, @Req() req: OctoRequest & { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.create(body, principal.tenantId, principal.sub);
  }

  @Get(':id')
  @RequireScopes('executions:read')
  @HierarchyContextMeta({ executionIdPath: 'id' })
  getSummary(@Param('id') id: string, @Req() req: OctoRequest & { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.getSummary(id, principal.tenantId);
  }

  @Get(':id/timeline')
  @RequireScopes('executions:read')
  @HierarchyContextMeta({ executionIdPath: 'id' })
  getTimeline(@Param('id') id: string, @Req() req: OctoRequest & { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.getTimeline(id, principal.tenantId);
  }

  @Post(':id/cancel')
  @RequireScopes('executions:write')
  @HierarchyContextMeta({ executionIdPath: 'id' })
  cancel(@Param('id') id: string, @Req() req: OctoRequest & { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.cancel(id, principal.tenantId);
  }

  @Post(':id/resume')
  @RequireScopes('executions:write')
  @HierarchyContextMeta({ executionIdPath: 'id' })
  resume(@Param('id') id: string, @Req() req: OctoRequest & { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.resume(id, principal.tenantId);
  }
}
