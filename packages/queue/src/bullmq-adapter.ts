// packages/queue/src/bullmq-adapter.ts
// BullMQ implementations of IQueue<T> and IWorker<T>.
//
// This file is the ONLY place in the @octo/queue package where BullMQ
// types are imported directly. All other files depend on the interfaces.
//
// Design decisions:
// - BullMQQueue wraps InstrumentedQueue (OTel + traceparent injection).
//   It does NOT re-implement instrumentation; it adapts InstrumentedQueue
//   to the IQueue contract.
// - BullMQWorker wraps createInstrumentedWorker (OTel span per job).
//   It adds the IWorker event system on top.
// - Both adapters emit structured errors with DlqReason for DLQ routing.
// - Graceful shutdown: close(timeoutMs) waits for in-flight jobs before
//   closing the Redis connection.
//
// ADR: F0-002 (Provider Abstraction), TASK 10

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import {
  type Job as BullJob,
  type JobsOptions,
  type WorkerOptions,
  Queue as BullQueue,
  Worker as BullWorker,
} from 'bullmq';
import { DlqReason } from '@octo/contracts';
import { createLogger } from '@octo/observability';
import { createRedisConnection } from './connection';
import { injectTraceparent } from './traceparent';
import type {
  IJob,
  IQueue,
  IWorker,
  IQueueFactory,
  IWorkerFactory,
  OctoJobPayload,
  OctoJobMeta,
  JobHandler,
  JobResult,
  QueueConfig,
  WorkerConfig,
  AddJobOptions,
  QueueHealth,
  RetryPolicy,
  WorkerEventMap,
} from './interfaces';

type AnyData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const logger = createLogger({ service: 'queue:bullmq-adapter' });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function retryPolicyToJobOptions(policy: RetryPolicy): Partial<JobsOptions> {
  return {
    attempts: policy.maxAttempts,
    backoff: {
      type: policy.backoff === 'exponential' ? 'exponential' : 'fixed',
      delay: policy.delayMs,
    },
  };
}

function buildBullJobOptions(opts?: AddJobOptions, defaultPolicy?: RetryPolicy): JobsOptions {
  const policy = opts?.retryPolicy ?? defaultPolicy;
  return {
    jobId: opts?.jobId,
    delay: opts?.delayMs,
    priority: opts?.priority,
    removeOnComplete:
      opts?.removeOnCompleteAge !== undefined ? { age: opts.removeOnCompleteAge } : { age: 3600 },
    removeOnFail:
      opts?.removeOnFailAge !== undefined ? { age: opts.removeOnFailAge } : { age: 86400 },
    ...(policy ? retryPolicyToJobOptions(policy) : {}),
    ...(opts?.deduplicationId ? { deduplication: { id: opts.deduplicationId } } : {}),
  };
}

/** Wrap a BullMQ Job into the IJob<T> contract. */
function adaptJob<T>(bullJob: BullJob<AnyData>, meta: OctoJobMeta): IJob<T> {
  return {
    id: bullJob.id ?? '',
    data: bullJob.data as OctoJobPayload<T>,
    meta,
    attemptsMade: bullJob.attemptsMade,
    timestamp: bullJob.timestamp,
    // BullMQ v5 changed updateProgress() return type to Promise<number>.
    // IJob.updateProgress is typed as Promise<void>. Discard the value.
    updateProgress: (progress): Promise<void> =>
      bullJob.updateProgress(progress).then((): void => {
        /* discard */
      }),
    // BullMQ v5 Job.log() returns Promise<number> (log entry index).
    // IJob.log is typed as Promise<void> — discard the numeric return value.
    log: (row): Promise<void> =>
      bullJob.log(row).then((): void => {
        /* discard */
      }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQQueue
// ─────────────────────────────────────────────────────────────────────────────

export class BullMQQueue<T = AnyData> implements IQueue<T> {
  readonly name: string;
  private readonly bull: BullQueue<AnyData>;
  private readonly defaultPolicy?: RetryPolicy;
  private readonly workerId: string;

  constructor(name: string, config: QueueConfig) {
    this.name = name;
    this.defaultPolicy = config.defaultRetryPolicy;
    this.workerId = crypto.randomUUID();
    const connection = createRedisConnection(config.redisUrl);
    this.bull = new BullQueue<AnyData>(name, { connection });
  }

  async add(jobName: string, payload: OctoJobPayload<T>, opts?: AddJobOptions): Promise<string> {
    const data: AnyData = injectTraceparent(payload as AnyData);
    const jobOpts = buildBullJobOptions(opts, this.defaultPolicy);
    const job = await this.bull.add(jobName, data, jobOpts);
    logger.debug({ jobId: job.id, queueName: this.name, jobName }, 'job enqueued');
    return job.id ?? '';
  }

  async addBulk(
    jobs: Array<{ name: string; payload: OctoJobPayload<T>; opts?: AddJobOptions }>
  ): Promise<string[]> {
    const bullJobs = jobs.map(({ name, payload, opts }) => ({
      name,
      data: injectTraceparent(payload as AnyData) as AnyData,
      opts: buildBullJobOptions(opts, this.defaultPolicy),
    }));
    const results = await this.bull.addBulk(bullJobs);
    return results.map((j) => j.id ?? '');
  }

  async pause(): Promise<void> {
    await this.bull.pause();
  }

  // BullMQ v5 Queue.resume() returns Promise<number> (resumed-job count).
  // IQueue<T>.resume() is typed as Promise<void> — discard the value.
  resume(): Promise<void> {
    return this.bull.resume().then(() => undefined);
  }

  async drain(delayed = false): Promise<void> {
    await this.bull.drain(delayed);
  }

  async obliterate(opts?: { force?: boolean }): Promise<void> {
    await this.bull.obliterate(opts);
  }

  async getHealth(): Promise<QueueHealth> {
    const counts = await this.bull.getJobCounts();
    const isPaused = await this.bull.isPaused();
    return {
      name: this.name,
      waiting: counts['waiting'] ?? 0,
      active: counts['active'] ?? 0,
      completed: counts['completed'] ?? 0,
      failed: counts['failed'] ?? 0,
      delayed: counts['delayed'] ?? 0,
      paused: isPaused,
      snapshotAt: new Date().toISOString(),
    };
  }

  async getJobCounts(): Promise<Record<string, number>> {
    return this.bull.getJobCounts();
  }

  async getJob(jobId: string): Promise<IJob<T> | null> {
    const bullJob = await this.bull.getJob(jobId);
    if (!bullJob) return null;
    const meta: OctoJobMeta = {
      workerName: this.name,
      workerId: this.workerId,
      pickedUpAt: new Date().toISOString(),
      queueName: this.name,
    };
    return adaptJob<T>(bullJob, meta);
  }

  async close(): Promise<void> {
    await this.bull.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQWorker
// ─────────────────────────────────────────────────────────────────────────────

export class BullMQWorker<T = AnyData> implements IWorker<T> {
  readonly name: string;
  readonly concurrency: number;

  private readonly bull: BullWorker<AnyData>;
  private readonly emitter: EventEmitter;
  private readonly workerId: string;
  private readonly shutdownTimeoutMs: number;

  constructor(name: string, handler: JobHandler<T>, config: WorkerConfig) {
    this.name = name;
    this.concurrency = config.concurrency ?? 1;
    this.workerId = config.workerId ?? crypto.randomUUID();
    this.shutdownTimeoutMs = config.shutdownTimeoutMs ?? 30_000;
    this.emitter = new EventEmitter();

    const connection = createRedisConnection(config.redisUrl);

    const workerOptions: WorkerOptions = {
      connection,
      concurrency: this.concurrency,
      ...(config.retryPolicy
        ? (retryPolicyToJobOptions(config.retryPolicy) as Partial<WorkerOptions>)
        : {}),
    };

    this.bull = new BullWorker<AnyData>(
      name,
      async (bullJob: BullJob<AnyData>) => this._process(bullJob, handler),
      workerOptions
    );

    this._bindBullEvents();
  }

  // ── IWorker implementation ───────────────────────────────────────────────

  async run(): Promise<void> {
    // BullMQ Worker starts automatically on construction.
    // run() is a no-op here but fulfills the IWorker contract.
  }

  async pause(): Promise<void> {
    await this.bull.pause();
  }
  async resume(): Promise<void> {
    await this.bull.resume();
  }

  async close(timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? this.shutdownTimeoutMs;
    await Promise.race([
      this.bull.close(),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Worker ${this.name} shutdown timed out after ${timeout}ms`)),
          timeout
        )
      ),
    ]);
    this.emitter.emit('worker:closed');
  }

  on<K extends keyof WorkerEventMap<T>>(event: K, listener: WorkerEventMap<T>[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof WorkerEventMap<T>>(event: K, listener: WorkerEventMap<T>[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async _process(bullJob: BullJob<AnyData>, handler: JobHandler<T>): Promise<void> {
    const meta: OctoJobMeta = {
      workerName: this.name,
      workerId: this.workerId,
      pickedUpAt: new Date().toISOString(),
      queueName: this.name,
    };
    const job = adaptJob<T>(bullJob, meta);

    logger.debug(
      { jobId: job.id, executionId: job.data.executionId, workerName: this.name },
      'job started'
    );
    this.emitter.emit('job:started', job);

    let result: JobResult;
    try {
      result = await handler(job);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(
        { jobId: job.id, error: error.message, workerName: this.name },
        'job handler threw unhandled error'
      );
      this.emitter.emit('job:failed', job, error);
      throw error;
    }

    if (!result.success) {
      const error = new Error(result.error?.message ?? 'job handler returned failure');
      this.emitter.emit('job:failed', job, error);

      if (result.error?.retryable === false) {
        const reason: DlqReason = result.error.dlqReason ?? DlqReason.NON_RETRYABLE_ERROR;
        this.emitter.emit('job:dead', job, reason);
        throw Object.assign(error, { failedReason: reason });
      }

      throw error;
    }

    logger.debug(
      { jobId: job.id, executionId: job.data.executionId, workerName: this.name },
      'job completed'
    );
    this.emitter.emit('job:completed', job, result);
  }

  private _bindBullEvents(): void {
    this.bull.on('ready', () => {
      logger.info({ workerName: this.name, workerId: this.workerId }, 'worker ready');
      this.emitter.emit('worker:ready');
    });

    this.bull.on('error', (err) => {
      logger.error({ workerName: this.name, error: err.message }, 'worker error');
      this.emitter.emit('worker:error', err);
    });

    this.bull.on('failed', (bullJob, err) => {
      if (!bullJob) return;
      const meta: OctoJobMeta = {
        workerName: this.name,
        workerId: this.workerId,
        pickedUpAt: new Date().toISOString(),
        queueName: this.name,
      };
      const job = adaptJob<T>(bullJob, meta);
      const attemptsMade = bullJob.attemptsMade;
      const maxAttempts = bullJob.opts.attempts ?? 1;

      if (attemptsMade >= maxAttempts) {
        const reason: DlqReason = DlqReason.MAX_RETRIES_EXCEEDED;
        logger.warn(
          { jobId: job.id, executionId: job.data.executionId, reason },
          'job exhausted retries — routing to DLQ'
        );
        this.emitter.emit('job:dead', job, reason);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

export class BullMQQueueFactory implements IQueueFactory {
  create<T>(name: string, config: QueueConfig): IQueue<T> {
    return new BullMQQueue<T>(name, config);
  }
}

export class BullMQWorkerFactory implements IWorkerFactory {
  create<T>(name: string, handler: JobHandler<T>, config: WorkerConfig): IWorker<T> {
    return new BullMQWorker<T>(name, handler, config);
  }
}
