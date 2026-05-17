import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { HealthService, type HealthStatus } from './health.service';

/**
 * Health endpoints — no authentication required (public probes).
 *
 * GET /api/health       — full status (Redis + BullMQ + Postgres)
 * GET /api/health/live  — liveness probe (always 200 if process is alive)
 * GET /api/health/ready — readiness probe (503 if any dependency is down)
 * GET /api/health/ping  — enqueues a health job to validate BullMQ end-to-end
 * GET /api/health/version — service version, commit, phase
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Full health status — always 200, consumers check the `status` field. */
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthStatus> {
    return this.healthService.check();
  }

  /**
   * Liveness probe.
   * Returns 200 as long as the process is alive.
   * Coolify / Docker HEALTHCHECK hits this endpoint.
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe.
   * Returns 200 when all dependencies are healthy.
   * Returns 503 Service Unavailable when any dependency is down or degraded.
   * Load balancers and Coolify use this to gate traffic.
   */
  @Get('ready')
  async ready(@Res() res: FastifyReply): Promise<void> {
    const checks = await this.healthService.runChecks();
    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const httpStatus = allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    void res.status(httpStatus).send({
      status: allOk ? 'ok' : 'error',
      ready: allOk,
      timestamp: new Date().toISOString(),
      checks,
    });
  }

  /** Enqueue a BullMQ health job to validate end-to-end queue connectivity. */
  @Get('ping')
  @HttpCode(HttpStatus.OK)
  async ping(): Promise<{ jobId: string; enqueuedAt: string }> {
    const jobId = await this.healthService.enqueueHealthJob();
    return { jobId, enqueuedAt: new Date().toISOString() };
  }

  /**
   * Version info.
   * Exposes build metadata injected at image build time via ARG/ENV.
   * Useful for verifying which commit / phase is deployed.
   */
  @Get('version')
  @HttpCode(HttpStatus.OK)
  version(): Record<string, string> {
    return {
      service: 'octo-api',
      version: process.env['BUILD_VERSION'] ?? 'unknown',
      commit: process.env['BUILD_COMMIT'] ?? 'unknown',
      phase: process.env['BUILD_PHASE'] ?? 'F0',
      built_at: process.env['BUILD_TIME'] ?? 'unknown',
      node: process.version,
    };
  }
}
