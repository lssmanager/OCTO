import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../admin/internal-secret.guard';
import { OpsService } from './ops.service';

@Public()
@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  status(): Record<string, unknown> {
    return this.opsService.getStatus();
  }
}
