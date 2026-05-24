import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ExecutionControllerService, type CreateExecutionRequest } from './execution-controller.service';

type Principal = { tenantId: string; sub: string };

@Controller('/v1/executions')
export class ExecutionController {
  constructor(private readonly service: ExecutionControllerService) {}

  @Post()
  create(@Body() body: CreateExecutionRequest, @Req() req: { user?: Principal }) {
    return this.service.create(body, req.user?.tenantId ?? 'legacy', req.user?.sub ?? 'system');
  }

  @Get(':id')
  getSummary(@Param('id') id: string, @Req() req: { user?: Principal }) {
    return this.service.getSummary(id, req.user?.tenantId ?? 'legacy');
  }

  @Get(':id/timeline')
  getTimeline(@Param('id') id: string, @Req() req: { user?: Principal }) {
    return this.service.getTimeline(id, req.user?.tenantId ?? 'legacy');
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: { user?: Principal }) {
    return this.service.cancel(id, req.user?.tenantId ?? 'legacy');
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @Req() req: { user?: Principal }) {
    return this.service.resume(id, req.user?.tenantId ?? 'legacy');
  }
}
