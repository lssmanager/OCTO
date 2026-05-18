/**
 * QueueMetricsController — GET /api/admin/queues/metrics
 *
 * Returns a real-time snapshot of all BullMQ queue job counts.
 * Protected by InternalSecretGuard (requires X-Internal-Secret header
 * in non-development environments).
 *
 * Response shape:
 *   [
 *     { queue, waiting, active, completed, failed, delayed, paused, timestamp },
 *     ...
 *   ]
 *
 * Used by:
 *   - Grafana dashboard (polled via JSON datasource)
 *   - Prometheus scrape via /metrics (F1+ — gauge export)
 *   - Frontend queue health panel (F1+)
 */
import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';
import { QueueMetricsService } from './queue-metrics.service';
import type { QueueMetricsSnapshot } from './queue-metrics.service';

@Controller('admin/queues')
@UseGuards(InternalSecretGuard)
export class QueueMetricsController {
  constructor(private readonly metrics: QueueMetricsService) {}

  @Get('metrics')
  async getMetrics(): Promise<QueueMetricsSnapshot[]> {
    return this.metrics.getMetrics();
  }
}
