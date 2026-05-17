import { Module } from '@nestjs/common';
import { loadApiConfig } from '@octo/config';
import { HealthModule } from './health/health.module';
import { MetricsController } from './metrics.controller';

const config = loadApiConfig();

@Module({
  imports: [HealthModule],
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
