// apps/api/src/ops/ops.controller.ts
// H1: Ops Console controller — /api/ops/status endpoint.
// Public infrastructure status — no auth required.

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { OpsService, type OpsStatus } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  /** GET /api/ops/status — full infrastructure status JSON. */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status(): Promise<OpsStatus> {
    return this.opsService.getStatus();
  }
}
