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
import { AgentService, type CreateAgentDto, type PatchAgentDto } from './agent.service';
import type { Principal } from '../auth/types/principal';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/guards/tenant-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { HierarchyAccessGuard } from '../auth/guards/hierarchy-access.guard';
import { HierarchyContextMeta } from '../auth/decorators/hierarchy-context.decorator';

function mustPrincipal(req: { user?: Principal }): Principal {
  if (!req.user?.tenantId || !req.user?.sub) throw new UnauthorizedException('unauthorized');
  return req.user;
}

function parseLimit(limit?: string): number {
  if (!limit) return 50;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 200) throw new BadRequestException('invalid_limit');
  return n;
}

@Controller('/v1/agents')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard, HierarchyAccessGuard)
export class AgentController {
  constructor(private readonly service: AgentService) {}

  @Post()
  @RequireScopes('agent:create')
  @HierarchyContextMeta({ agencyIdPath: 'metadata.agencyId', workspaceIdPath: 'metadata.workspaceId' })
  create(@Body() body: CreateAgentDto, @Req() req: { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.create(p.tenantId, p.sub, body);
  }

  @Get()
  @RequireScopes('agent:read')
  list(@Req() req: { user?: Principal }, @Query('limit') limit?: string) {
    const p = mustPrincipal(req);
    return this.service.list(p.tenantId, parseLimit(limit));
  }

  @Get(':id')
  @RequireScopes('agent:read')
  get(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.get(p.tenantId, id);
  }

  @Patch(':id')
  @RequireScopes('agent:update')
  patch(@Param('id') id: string, @Body() body: PatchAgentDto, @Req() req: { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.patch(p.tenantId, id, body, p.sub);
  }

  @Delete(':id')
  @RequireScopes('agent:delete')
  delete(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const p = mustPrincipal(req);
    return this.service.delete(p.tenantId, id, p.sub);
  }

  @Get(':id/versions')
  @RequireScopes('agent:read')
  versions(
    @Param('id') id: string,
    @Req() req: { user?: Principal },
    @Query('limit') limit?: string
  ) {
    const p = mustPrincipal(req);
    return this.service.versions(p.tenantId, id, parseLimit(limit));
  }
}
