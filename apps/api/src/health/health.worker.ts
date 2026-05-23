// PATCH 7: Replace new Logger() (NestJS built-in, no trace correlation,
// plain text format) with createLogger() from @octo/observability.
// All log events now emit structured JSON with trace_id, worker_id,
// execution_id — consistent with OTel trace propagation across the system.
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { createWorker, QUEUE_NAMES, type HealthJobData } from '@octo/queue';
import { createLogger } from '@octo/observability';

/**
 * Health job worker — F0 validation that BullMQ is operational.
 *
 * This is the simplest possible worker: it processes a health ping job
 * and returns { status: 'ok' }. If this worker fails, BullMQ is broken.
 *
 * Architecture note: In F1+, execution workers live in runtime-worker (Python),
 * not here. This NestJS worker exists ONLY for infrastructure validation.
 */
@Injectable()
export class HealthWorker implements OnModuleInit, OnModuleDestroy {
  // Module-level logger — structured, pino-backed, trace-correlation ready.
  private readonly logger = createLogger({ service: 'health-worker' });
  private worker!: Worker<HealthJobData>;

  onModuleInit(): void {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const concurrency = parseInt(process.env['WORKER_CONCURRENCY'] ?? '2', 10);

    this.worker = createWorker<HealthJobData>(
      QUEUE_NAMES.HEALTH,
      async (job: Job<HealthJobData>) => {
        this.logger.info({
          event: 'health_job_processed',
          trace_id: 'job',
          worker_id: 'health-worker',
          execution_id: job.id,
          job_data: job.data,
          msg: 'Health job processed',
        });
        return { status: 'ok', processedAt: new Date().toISOString() };
      },
      { redisUrl, concurrency }
    );

    this.worker.on('failed', (job: Job<HealthJobData> | undefined, err: Error) => {
      this.logger.error({
        event: 'health_job_failed',
        trace_id: 'job',
        worker_id: 'health-worker',
        execution_id: job?.id,
        error: err.message,
        stack: err.stack,
        msg: 'Health job failed',
      });
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error({
        event: 'health_worker_error',
        trace_id: 'system',
        worker_id: 'health-worker',
        error: err.message,
        msg: 'Health worker error',
      });
    });

    this.logger.info({
      event: 'health_worker_started',
      trace_id: 'bootstrap',
      worker_id: 'health-worker',
      concurrency,
      msg: `Health worker started (concurrency=${concurrency})`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.info({
      event: 'health_worker_closing',
      trace_id: 'shutdown',
      worker_id: 'health-worker',
      msg: 'Closing health worker (graceful shutdown)',
    });
    await this.worker.close();
    this.logger.info({
      event: 'health_worker_closed',
      trace_id: 'shutdown',
      worker_id: 'health-worker',
      msg: 'Health worker closed',
    });
  }
}
