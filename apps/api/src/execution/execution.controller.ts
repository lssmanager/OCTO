import { Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import {
  ExecutionControllerService,
  type CreateExecutionRequest,
} from './execution-controller.service';
import type { Principal } from '../auth/types/principal';

function requirePrincipal(req: { user?: Principal }): Principal {
  if (!req.user?.tenantId || !req.user?.sub) {
    throw new UnauthorizedException('UNAUTHORIZED');
  }
  return req.user;
}

@Controller('/v1/executions')
export class ExecutionController {
  constructor(private readonly service: ExecutionControllerService) {}

  @Post()
  create(@Body() body: CreateExecutionRequest, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.create(body, principal.tenantId, principal.sub);
  }

  @Get(':id')
  getSummary(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.getSummary(id, principal.tenantId);
  }

  @Get(':id/timeline')
  getTimeline(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.getTimeline(id, principal.tenantId);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.cancel(id, principal.tenantId);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @Req() req: { user?: Principal }) {
    const principal = requirePrincipal(req);
    return this.service.resume(id, principal.tenantId);
  }
}
