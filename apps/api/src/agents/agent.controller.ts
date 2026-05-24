import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AgentService, type CreateAgentDto, type PatchAgentDto } from './agent.service';

type Principal = { tenantId: string; sub: string };

@Controller('/v1/agents')
export class AgentController {
  constructor(private readonly service: AgentService) {}

  @Post()
  create(@Body() body: CreateAgentDto, @Req() req: { user?: Principal }) { return this.service.create(req.user?.tenantId ?? 'legacy', req.user?.sub ?? 'system', body); }

  @Get()
  list(@Req() req: { user?: Principal }, @Query('limit') limit?: string) { return this.service.list(req.user?.tenantId ?? 'legacy', limit ? Number(limit) : 50); }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: { user?: Principal }) { return this.service.get(req.user?.tenantId ?? 'legacy', id); }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: PatchAgentDto, @Req() req: { user?: Principal }) { return this.service.patch(req.user?.tenantId ?? 'legacy', id, body, req.user?.sub ?? 'system'); }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: { user?: Principal }) { return this.service.delete(req.user?.tenantId ?? 'legacy', id, req.user?.sub ?? 'system'); }

  @Get(':id/versions')
  versions(@Param('id') id: string, @Req() req: { user?: Principal }, @Query('limit') limit?: string) { return this.service.versions(req.user?.tenantId ?? 'legacy', id, limit ? Number(limit) : 50); }
}
