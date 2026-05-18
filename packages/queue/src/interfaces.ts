// packages/queue/src/interfaces.ts
// TASK 10 — Provider-agnostic queue abstractions.
//
// Architecture rule (ABSOLUTE PRINCIPLE 7):
//   "Runtime must never directly depend on vendor SDKs."
//   All BullMQ types are confined to bullmq-adapter.ts.
//   Everything above the adapter layer depends ONLY on these interfaces.
//
// Consumers (control plane, runtime-worker) import from IQueue / IWorker.
// The BullMQ adapter is injected via IQueueFactory / IWorkerFactory.
// This enables:
//   - Unit tests with in-memory queue fakes
//   - Future migration to another queue backend without touching business logic
//   - Clean isolation of BullMQ upgrade surface
//
// ADR: F0-002 (Provider Abstraction), TASK 10

import type {
  ExecutionStatus,
  TriggerSource,
  DlqReason,
} from '@octo/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// JOB ENVELOPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical job payload envelope for all OCTO queues.
 *
 * Every job enqueued in BullMQ carries this shape as its data.
 * Fields are read-only — jobs are immutable once enqueued.
 *
 * The `payload` field carries the domain-specific data (ExecutionJobData,
 * ToolJobData, etc.). The envelope fields are always present and provide
 * the runtime context needed for observability, governance, and dedup.
 */
export interface OctoJobPayload<T = Record<string, unknown>> {
  // ── Identity ──────────────────────────────────────────────────────────
  readonly jobId: string;          // BullMQ job ID (UUID v7)
  readonly tenantId: string;       // mandatory from C1
  readonly executionId: string;    // matches executions.id in PostgreSQL

  // ── Observability ───────────────────────────────────────────────────────
  readonly traceId: string;        // W3C traceparent root
  readonly runId: string;          // groups all executions in a logical run
  readonly agentId: string;

  // ── Trigger context ───────────────────────────────────────────────────
  readonly triggerSource: TriggerSource;
  readonly triggerRef?: string;    // message ID, schedule ID, parent execution ID

  // ── Retry context ───────────────────────────────────────────────────────
  readonly attempt: number;        // execution-level attempt counter (0-based)
  readonly maxAttempts: number;

  // ── Deduplication (TASK 5) ───────────────────────────────────────────────
  readonly idempotencyKey?: string;

  // ── W3C traceparent propagation ───────────────────────────────────────────
  // Injected by the producer via injectTraceparent().
  // Extracted by the worker to restore the OTel span context.
  readonly traceparent?: string;
  readonly tracestate?: string;

  // ── Domain payload ─────────────────────────────────────────────────────────
  readonly payload: T;
}

/**
 * Runtime metadata stamped on every job by the worker.
 * Available inside JobHandler<T> via IJob<T>.meta.
 */
export interface OctoJobMeta {
  readonly workerName: string;     // which worker instance picked up this job
  readonly workerId: string;       // UUID of the worker process
  readonly pickedUpAt: string;     // ISO 8601
  readonly queueName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// IJob
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized view of a job, independent of BullMQ internals.
 * Passed to JobHandler<T> by the worker.
 *
 * @template T - domain payload type (e.g. ExecutionJobData)
 */
export interface IJob<T = Record<string, unknown>> {
  /** BullMQ job ID */
  readonly id: string;
  /** Full typed job envelope */
  readonly data: OctoJobPayload<T>;
  /** Runtime metadata stamped by the worker at pickup time */
  readonly meta: OctoJobMeta;
  /** Current attempt number (1-based, matches BullMQ semantics) */
  readonly attemptsMade: number;
  /** Timestamp when the job was created (Unix ms) */
  readonly timestamp: number;
  /** Update job progress (0-100) for UI display */
  updateProgress(progress: number): Promise<void>;
  /** Log a message attached to this job */
  log(row: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB HANDLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed result returned by a job handler.
 * Return `{ success: false }` for retryable failures (BullMQ will retry).
 * Throw for non-retryable failures — set `error.retryable = false`.
 */
export interface JobResult<TOutput = unknown> {
  success: boolean;
  output?: TOutput;
  /** Set on failure. If retryable === false, job goes to DLQ immediately. */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    dlqReason?: DlqReason;
    details?: Record<string, unknown>;
  };
}

/**
 * Job handler function signature.
 * Implement this in the runtime-worker to process each job type.
 *
 * @example
 *   const handleExecution: JobHandler<ExecutionJobData> = async (job) => {
 *     await runExecution(job.data.payload.executionId);
 *     return { success: true };
 *   };
 */
export type JobHandler<T = Record<string, unknown>, TOutput = unknown> =
  (job: IJob<T>) => Promise<JobResult<TOutput>>;

// ─────────────────────────────────────────────────────────────────────────────
// RETRY POLICY
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts: number;
  /** Backoff strategy. 'exponential' recommended for LLM calls. */
  backoff: 'fixed' | 'exponential' | 'linear';
  /** Base delay in ms. Exponential: delay * 2^attempt. */
  delayMs: number;
  /** Maximum delay cap in ms. Prevents backoff from growing unbounded. */
  maxDelayMs?: number;
  /** Jitter: add random(0, delayMs * jitterFactor) to each delay. */
  jitterFactor?: number;
}

/** Default retry policy for execution jobs. */
export const DEFAULT_EXECUTION_RETRY_POLICY: Readonly<RetryPolicy> = {
  maxAttempts:  3,
  backoff:      'exponential',
  delayMs:      2_000,    // 2s base
  maxDelayMs:   60_000,   // 60s cap
  jitterFactor: 0.2,
};

/** Default retry policy for tool dispatch jobs. */
export const DEFAULT_TOOL_RETRY_POLICY: Readonly<RetryPolicy> = {
  maxAttempts:  5,
  backoff:      'exponential',
  delayMs:      1_000,
  maxDelayMs:   30_000,
  jitterFactor: 0.1,
};

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE HEALTH
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  /** Timestamp of snapshot (ISO 8601) */
  snapshotAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// IQueue (producer)
// ─────────────────────────────────────────────────────────────────────────────

export interface AddJobOptions {
  /** BullMQ job ID — use executionId for idempotent re-enqueue. */
  jobId?: string;
  /** Delay before first attempt in ms. */
  delayMs?: number;
  /** Retry policy override for this job. */
  retryPolicy?: RetryPolicy;
  /** Priority (lower number = higher priority). Default: 0. */
  priority?: number;
  /** Remove completed job after N seconds (0 = keep forever). */
  removeOnCompleteAge?: number;
  /** Remove failed job after N seconds (0 = keep forever). */
  removeOnFailAge?: number;
  /** Deduplicate: if a job with this key exists, skip enqueue. */
  deduplicationId?: string;
}

/**
 * Producer interface — enqueues jobs, manages queue lifecycle.
 *
 * @template T - domain payload type
 */
export interface IQueue<T = Record<string, unknown>> {
  readonly name: string;

  /**
   * Enqueue a single job.
   * Returns the assigned job ID.
   */
  add(
    jobName: string,
    payload: OctoJobPayload<T>,
    opts?: AddJobOptions,
  ): Promise<string>;

  /**
   * Enqueue multiple jobs atomically.
   * Returns array of job IDs in submission order.
   */
  addBulk(
    jobs: Array<{ name: string; payload: OctoJobPayload<T>; opts?: AddJobOptions }>,
  ): Promise<string[]>;

  /** Pause the queue — workers stop picking up new jobs. */
  pause(): Promise<void>;

  /** Resume a paused queue. */
  resume(): Promise<void>;

  /**
   * Drain the queue — wait for active jobs to finish, reject all waiting.
   * Use before graceful shutdown.
   */
  drain(delayed?: boolean): Promise<void>;

  /**
   * Obliterate — delete all jobs and queue metadata from Redis.
   * DANGER: irreversible. Only use in tests or explicit cleanup flows.
   */
  obliterate(opts?: { force?: boolean }): Promise<void>;

  /** Returns a snapshot of queue counts for health checks. */
  getHealth(): Promise<QueueHealth>;

  /** Returns raw job counts by state. */
  getJobCounts(): Promise<Record<string, number>>;

  /** Get a job by ID. Returns null if not found. */
  getJob(jobId: string): Promise<IJob<T> | null>;

  /** Close connection — call on application shutdown. */
  close(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IWorker (consumer)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerEventMap<T> {
  /** Fired when a job starts processing. */
  'job:started':   (job: IJob<T>) => void;
  /** Fired when a job completes successfully. */
  'job:completed': (job: IJob<T>, result: JobResult) => void;
  /** Fired when a job fails (may be retried). */
  'job:failed':    (job: IJob<T>, error: Error) => void;
  /** Fired when a job is moved to the DLQ. */
  'job:dead':      (job: IJob<T>, reason: DlqReason) => void;
  /** Fired when the worker is ready to accept jobs. */
  'worker:ready':  () => void;
  /** Fired when the worker has closed gracefully. */
  'worker:closed': () => void;
  /** Fired on worker-level error (Redis disconnect, etc.). */
  'worker:error':  (error: Error) => void;
}

/**
 * Consumer interface — processes jobs from the queue.
 *
 * @template T - domain payload type
 */
export interface IWorker<T = Record<string, unknown>> {
  readonly name: string;
  readonly concurrency: number;

  /**
   * Start processing jobs.
   * Safe to call multiple times — no-op if already running.
   */
  run(): Promise<void>;

  /** Pause — finish current jobs, stop picking up new ones. */
  pause(): Promise<void>;

  /** Resume after pause. */
  resume(): Promise<void>;

  /**
   * Graceful shutdown:
   *   1. Stop accepting new jobs
   *   2. Wait for in-flight jobs to complete (up to timeoutMs)
   *   3. Close Redis connection
   */
  close(timeoutMs?: number): Promise<void>;

  /** Subscribe to worker lifecycle and job events. */
  on<K extends keyof WorkerEventMap<T>>(event: K, listener: WorkerEventMap<T>[K]): this;
  off<K extends keyof WorkerEventMap<T>>(event: K, listener: WorkerEventMap<T>[K]): this;
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY INTERFACES (DI / testing)
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueConfig {
  /** Redis connection URL (redis://...). Required. */
  redisUrl: string;
  /** Default retry policy applied to all jobs unless overridden per-job. */
  defaultRetryPolicy?: RetryPolicy;
  /** Default time to keep completed job data in Redis (seconds). Default: 3600. */
  defaultRemoveOnCompleteAge?: number;
  /** Default time to keep failed job data in Redis (seconds). Default: 86400. */
  defaultRemoveOnFailAge?: number;
}

export interface WorkerConfig {
  /** Redis connection URL (redis://...). Required. */
  redisUrl: string;
  /** Number of jobs to process concurrently. Default: 1. */
  concurrency?: number;
  /** Unique worker instance ID (e.g. pod name + PID). Auto-generated if omitted. */
  workerId?: string;
  /** Retry policy — used to configure BullMQ retry options. */
  retryPolicy?: RetryPolicy;
  /** Timeout for graceful shutdown in ms. Default: 30_000. */
  shutdownTimeoutMs?: number;
}

/**
 * Factory for creating IQueue instances.
 * Inject this to decouple producers from BullMQ.
 */
export interface IQueueFactory {
  create<T>(name: string, config: QueueConfig): IQueue<T>;
}

/**
 * Factory for creating IWorker instances.
 * Inject this to decouple consumers from BullMQ.
 */
export interface IWorkerFactory {
  create<T>(name: string, handler: JobHandler<T>, config: WorkerConfig): IWorker<T>;
}
