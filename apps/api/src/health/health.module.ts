import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthWorker } from './health.worker';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthWorker],
  exports: [HealthService],
})
export class HealthModule {}
