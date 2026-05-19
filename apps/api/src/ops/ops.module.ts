// apps/api/src/ops/ops.module.ts
// H1: Ops Console — infrastructure status endpoint.
// F0-only: exposes build metadata + service health + queue stats.
// No F1+ features (agents, memory, channels, etc.).

import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [HealthModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
