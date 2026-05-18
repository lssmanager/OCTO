/**
 * BullBoardModule — NestJS module for BullBoard UI + queue metrics.
 *
 * Registers:
 *   - QueueMetricsService (injectable)
 *   - QueueMetricsController (GET /api/admin/queues/metrics)
 *   - InternalSecretGuard (applied to all admin controllers)
 *
 * The actual BullBoard Fastify plugin is registered in main.ts via
 * FastifyBullBoardPlugin.register(app) — it must run on the raw
 * Fastify instance before listen(), outside NestJS DI.
 *
 * Why separate from main module:
 *   BullBoard is an operational concern (observability), not a
 *   domain concern. Keeping it isolated means it can be toggled
 *   off without touching AppModule or domain modules.
 */
import { Module } from '@nestjs/common';
import { QueueMetricsController } from './queue-metrics.controller';
import { QueueMetricsService } from './queue-metrics.service';

@Module({
  controllers: [QueueMetricsController],
  providers: [QueueMetricsService],
  exports: [QueueMetricsService],
})
export class BullBoardModule {}
