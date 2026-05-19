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
 * GET /api/health        — full status (Redis + BullMQ + Postgres)
 * GET /api/health/live   — liveness probe (always 200 if process is alive)
 * GET /api/health/ready  — readiness probe (503 if any dependency is down)
 * GET /api/health/start  — startup probe (503 until bootstrap complete)
 * GET /api/health/ping   — enqueues a health job to validate BullMQ end-to-end
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
   *
   * PATCH 6: Migrated from @Res() to @Res({ passthrough: true }).
   * With bare @Res(), NestJS hands full response control to the handler
   * and bypasses interceptors, logging middleware, and trace propagation.
   * passthrough: true restores the full NestJS pipeline while still
   * allowing us to set a custom HTTP status code (200 vs 503).
   */
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Record<string, unknown>> {
    const checks = await this.healthService.runChecks();
    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const httpStatus = allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(httpStatus);
    return {
      status: allOk ? 'ok' : 'error',
      ready: allOk,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Startup probe.
   * Returns 200 when bootstrap is complete (migrations applied, DI ready, server listening).
   * Returns 503 Service Unavailable while bootstrap is in progress.
   *
   * Kubernetes / Coolify use this to delay traffic until the service is fully started.
   * Distinction: live (process alive) ≠ ready (deps ok) ≠ start (bootstrap done).
   */
  @Get('start')
  async start(
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Record<string, unknown>> {
    const booted = this.healthService.isBootstrapped();
    if (!booted) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'starting',
        bootstrapped: false,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      status: 'ok',
      bootstrapped: true,
      timestamp: new Date().toISOString(),
    };
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
