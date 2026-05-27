import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { TenantScopeGuard } from '../auth/guards/tenant-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { OpsV1Service } from './ops-v1.service';

@Controller('v1/ops')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard)
export class OpsV1Controller {
  constructor(private readonly svc: OpsV1Service) {}
  @Get('dlq') @RequireScopes('ops:read') dlq(@Req() req: any, @Query() q: any) { return this.svc.listDlq(req.tenantId, q); }
  @Post('dlq/:jobId/requeue') @RequireScopes('ops:write') requeue(@Req() req: any, @Param('jobId') jobId: string, @Body() b: any) { return this.svc.requeue(req.tenantId, req.userId, jobId, b); }
  @Delete('dlq/:jobId/discard') @RequireScopes('ops:write') discard(@Req() req: any, @Param('jobId') jobId: string, @Body() b: any) { return this.svc.discard(req.tenantId, req.userId, jobId, b); }
  @Get('metrics/summary') @RequireScopes('ops:read') metrics(@Req() req: any) { return this.svc.metrics(req.tenantId); }
  @Get('f1/status') @RequireScopes('ops:read') f1Status(@Req() req: any, @Query('windowMinutes') windowMinutes?: string) {
    return this.svc.f1Status(req.tenantId, windowMinutes ? Number(windowMinutes) : undefined);
  }
  @Get('executions/stale') @RequireScopes('ops:read') stale(@Req() req: any) { return this.svc.stale(req.tenantId); }
}

@Controller('v1/executions')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard)
export class OpsExecutionController {
  constructor(private readonly svc: OpsV1Service) {}
  @Post(':id/reset') @RequireScopes('ops:write') reset(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.svc.reset(req.tenantId, req.userId, id, b); }
}
