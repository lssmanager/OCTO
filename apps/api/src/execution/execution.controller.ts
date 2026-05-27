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

function requirePrincipal(req: { user?: Principal }): Principal {
  if (!req.user?.tenantId || !req.user?.sub) {
    throw new UnauthorizedException('UNAUTHORIZED');
  }
  return req.user;
}

@Controller('/v1/executions')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard, HierarchyAccessGuard)
export class ExecutionController {
  constructor(private readonly service: ExecutionControllerService) {}

  @Post()
  @RequireScopes('execution:create')
  @HierarchyContextMeta({ agencyIdPath: 'agencyId', workspaceIdPath: 'workspaceId' })
  create(@Body() body: CreateExecutionRequest, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.create(body, principal.tenantId, principal.sub);
  }

  @Get(':id')
  @RequireScopes('execution:read')
  getSummary(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.getSummary(id, principal.tenantId);
  }

  @Get(':id/timeline')
  @RequireScopes('execution:read')
  getTimeline(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.getTimeline(id, principal.tenantId);
  }

  @Post(':id/cancel')
  @RequireScopes('execution:cancel')
  cancel(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.cancel(id, principal.tenantId);
  }

  @Post(':id/resume')
  @RequireScopes('execution:resume')
  resume(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.resume(id, principal.tenantId);
  }
}
