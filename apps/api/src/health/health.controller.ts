import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';

/**
 * Health endpoints for Coolify healthchecks and observability.
 *
 * GET /api/health      — full status (Redis + BullMQ)
 * GET /api/health/live — liveness probe (always 200 if process is alive)
 * GET /api/health/ping — enqueues a health job to validate BullMQ end-to-end
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthStatus> {
    return this.healthService.check();
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: string; timestamp: string } {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  async ping(): Promise<{ jobId: string; enqueuedAt: string }> {
    const jobId = await this.healthService.enqueueHealthJob();
    return { jobId, enqueuedAt: new Date().toISOString() };
  }
}
