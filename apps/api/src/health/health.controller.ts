import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../admin/internal-secret.guard';
import { HealthService, type HealthStatus } from './health.service';

type PublicProbeStatus = 'ok' | 'not_ready';

interface PublicProbeResponse {
  status: PublicProbeStatus;
  timestamp: string;
}

interface PublicReadinessResponse extends PublicProbeResponse {
  ready: boolean;
}

/**
 * Health endpoints.
 *
 * Public probe-safe endpoints:
 * GET /api/health/live   - process liveness, no dependency details
 * GET /api/health/ready  - readiness boolean, no dependency details
 * GET /api/health/start  - startup boolean, no dependency details
 *
 * Internal/protected endpoints require X-Internal-Secret via InternalSecretGuard:
 * GET /api/health        - detailed dependency status
 * GET /api/health/ping   - BullMQ end-to-end health job enqueue
 * GET /api/health/version - build metadata
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Detailed dependency health - protected by InternalSecretGuard. */
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthStatus> {
    return this.healthService.check();
  }

  /** Liveness probe. Returns 200 as long as the process is alive. */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): PublicProbeResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe. Public response is intentionally minimal: no dependency
   * names, queue counts, latency, upstream metadata, or error strings.
   */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: FastifyReply): Promise<PublicReadinessResponse> {
    const checks = await this.healthService.runChecks();
    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const httpStatus = allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(httpStatus);
    return {
      status: allOk ? 'ok' : 'not_ready',
      ready: allOk,
      timestamp: new Date().toISOString(),
    };
  }

  /** Startup probe. Public response is intentionally minimal. */
  @Public()
  @Get('start')
  async start(@Res({ passthrough: true }) res: FastifyReply): Promise<PublicReadinessResponse> {
    const booted = this.healthService.isBootstrapped();
    if (!booted) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'not_ready',
        ready: false,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      status: 'ok',
      ready: true,
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

  /** Build metadata - protected by InternalSecretGuard. */
  @Get('version')
  @HttpCode(HttpStatus.OK)
  version(): Record<string, string> {
    return {
      service: 'octo-api',
      version: process.env['BUILD_VERSION'] ?? '0.1.0-f1',
      commit: process.env['BUILD_COMMIT'] ?? 'local',
      phase: process.env['BUILD_PHASE'] ?? 'F1',
      built_at: process.env['BUILD_TIME'] ?? 'local',
      node: process.version,
    };
  }
}
