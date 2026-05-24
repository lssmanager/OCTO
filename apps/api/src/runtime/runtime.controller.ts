import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/guards/tenant-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { RuntimeService } from './runtime.service';

@Controller('v1/runtime')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard)
export class RuntimeController {
  constructor(private readonly service: RuntimeService) {}

  @Get('health') @RequireScopes('ops:read') health() { return this.service.health(); }
  @Get('queues') @RequireScopes('ops:read') queues() { return this.service.queues(); }
  @Get('workers') @RequireScopes('ops:read') workers(@Req() req: any) { return this.service.workers(req.tenantId); }
  @Post('reclaim/:executionId') @RequireScopes('ops:write') reclaim(@Req() req: any, @Param('executionId') executionId: string) { return this.service.reclaim(req.tenantId, executionId); }
  @Post('cancel-all') @RequireScopes('ops:write') cancelAll(@Req() req: any, @Body() body: any) { return this.service.cancelAll(req.tenantId, body, req.roles ?? []); }
}
