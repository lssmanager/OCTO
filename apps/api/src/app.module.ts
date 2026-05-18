import { Module } from '@nestjs/common';
import { loadApiConfig } from '@octo/config';
import { BullBoardModule } from './admin/bullboard.module';
import { HealthModule } from './health/health.module';
import { MetricsController } from './metrics.controller';

const config = loadApiConfig();

@Module({
  imports: [HealthModule, BullBoardModule],
  controllers: [MetricsController],
  providers: [
    {
      provide: 'CONFIG',
      useValue: config,
    },
  ],
  exports: ['CONFIG'],
})
export class AppModule {}
