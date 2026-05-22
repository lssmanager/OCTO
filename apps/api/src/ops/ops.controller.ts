import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import type { OpsStatus } from '@octo/contracts';
import { Public } from '../admin/internal-secret.guard';
import { OpsService } from './ops.service';

@Public()
@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status(): Promise<OpsStatus> {
    return this.opsService.getStatus();
  }
}
