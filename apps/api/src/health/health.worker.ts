import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createWorker, QUEUE_NAMES, type HealthJobData } from '@octo/queue';

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
  private readonly logger = new Logger(HealthWorker.name);
  private worker!: Worker<HealthJobData>;

  onModuleInit(): void {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const concurrency = parseInt(process.env['WORKER_CONCURRENCY'] ?? '2', 10);

    this.worker = createWorker<HealthJobData>(
      QUEUE_NAMES.HEALTH,
      async (job) => {
        this.logger.log(
          { jobId: job.id, data: job.data },
          'Health job processed',
        );
        return { status: 'ok', processedAt: new Date().toISOString() };
      },
      { redisUrl, concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        { jobId: job?.id, error: err.message, stack: err.stack },
        'Health job failed',
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error({ error: err.message }, 'Health worker error');
    });

    this.logger.log(`Health worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing health worker (graceful shutdown)...');
    await this.worker.close();
    this.logger.log('Health worker closed.');
  }
}
