import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { TenantScopeGuard } from '../auth/guards/tenant-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { HierarchyContextMeta } from '../auth/decorators/hierarchy-context.decorator';
import { HierarchyAccessGuard } from '../auth/guards/hierarchy-access.guard';
import type { AuthPrincipal } from '../auth/hierarchy-access.service';
import type { OctoJwtPayload } from '../auth/types/jwt-payload';
import type { OctoRequest } from '../auth/types/octo-request';
import { OpsV1Service } from './ops-v1.service';

function requireAuthPrincipal(req: OctoRequest): AuthPrincipal {
  const user = req.user as OctoJwtPayload | undefined;
  const tenantId = req.tenantId ?? user?.tenant_id;
  const sub = req.userId ?? user?.sub;
  if (!tenantId || !sub) {
    throw new UnauthorizedException('UNAUTHORIZED');
  }
  return {
    tenantId,
    userId: sub,
    sub,
    ...(user?.agency_ids ? { agencyIds: user.agency_ids } : {}),
    ...(user?.workspace_ids ? { workspaceIds: user.workspace_ids } : {}),
  };
}

@Controller('v1/ops')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard, HierarchyAccessGuard)
export class OpsV1Controller {
  constructor(private readonly svc: OpsV1Service) {}
  @Get('dlq') @RequireScopes('ops:read') dlq(@Req() req: any, @Query() q: any) {
    return this.svc.listDlq(req.tenantId, q);
  }
  @Post('dlq/:jobId/requeue') @RequireScopes('ops:write') requeue(
    @Req() req: any,
    @Param('jobId') jobId: string,
    @Body() b: any
  ) {
    return this.svc.requeue(req.tenantId, req.userId, jobId, b);
  }
  @Delete('dlq/:jobId/discard') @RequireScopes('ops:write') discard(
    @Req() req: any,
    @Param('jobId') jobId: string,
    @Body() b: any
  ) {
    return this.svc.discard(req.tenantId, req.userId, jobId, b);
  }
  @Get('metrics/summary') @RequireScopes('ops:read') metrics(@Req() req: any) {
    return this.svc.metrics(req.tenantId);
  }
  @Get('f1/status') @RequireScopes('ops:read') f1Status(
    @Req() req: any,
    @Query('windowMinutes') windowMinutes?: string
  ) {
    return this.svc.f1Status(req.tenantId, windowMinutes ? Number(windowMinutes) : undefined);
  }
  @Get('executions/stale') @RequireScopes('ops:read') stale(@Req() req: any) {
    return this.svc.stale(req.tenantId);
  }
  @Get('executions/:id/observability')
  @RequireScopes('ops:read')
  @HierarchyContextMeta({ executionIdPath: 'id' })
  observeExecution(@Req() req: OctoRequest, @Param('id') id: string) {
    return this.svc.observeExecution(requireAuthPrincipal(req), id);
  }
  @Get('traces/:traceId') @RequireScopes('ops:read') observeTrace(
    @Req() req: OctoRequest,
    @Param('traceId') traceId: string
  ) {
    return this.svc.observeTrace(requireAuthPrincipal(req), traceId);
  }
}

@Controller('v1/executions')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard)
export class OpsExecutionController {
  constructor(private readonly svc: OpsV1Service) {}
  @Post(':id/reset') @RequireScopes('ops:write') reset(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: any
  ) {
    return this.svc.reset(req.tenantId, req.userId, id, b);
  }
}
