import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import type { OpsStatus } from '@octo/contracts';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status(): Promise<OpsStatus> {
    return this.opsService.getStatus();
  }
}
