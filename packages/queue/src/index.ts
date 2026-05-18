// packages/queue/src/index.ts
// @octo/queue public API

// ── Abstractions (import these in application code) ────────────────────────────────────────
// IQueue, IWorker, IJob are the primary consumer-facing API.
// Never import from bullmq-adapter directly in application code.
export type {
  IJob,
  IQueue,
  IWorker,
  IQueueFactory,
  IWorkerFactory,
  OctoJobPayload,
  OctoJobMeta,
  JobHandler,
  JobResult,
  QueueHealth,
  RetryPolicy,
  WorkerEventMap,
  AddJobOptions,
  QueueConfig  as IQueueConfig,
  WorkerConfig as IWorkerConfig,
} from './interfaces';

export {
  DEFAULT_EXECUTION_RETRY_POLICY,
  DEFAULT_TOOL_RETRY_POLICY,
} from './interfaces';

// ── BullMQ adapter (inject via factory — do not instantiate directly in app code) ─────────
// Exposed so the NestJS DI module can register BullMQQueueFactory as
// the IQueueFactory provider and BullMQWorkerFactory as IWorkerFactory.
export {
  BullMQQueue,
  BullMQWorker,
  BullMQQueueFactory,
  BullMQWorkerFactory,
} from './bullmq-adapter';

// ── Legacy / internal BullMQ helpers (keep for backward compat) ───────────────────────
// These are used by existing code that was written before the IQueue abstraction.
// New code should use IQueue / IWorker instead.
export { createQueue }            from './create-queue';
export { createWorker }           from './create-worker';
export { createDlq }              from './create-dlq';
export { DlqHandler }             from './dlq-handler';
export { createRedisConnection }  from './connection';
export { QUEUE_NAMES, MONITORED_QUEUES } from './queue-names';
export { DLQ_NAMES, getDlqName }  from './dlq-names';
export type { QueueName }         from './queue-names';
export type { DlqName, DlqNames } from './dlq-names';
export type { QueueConfig }       from './create-queue';
export type { WorkerConfig }      from './create-worker';
export type { DlqHandlerOptions } from './dlq-handler';

// ── Instrumented variants (OTel + traceparent propagation) ─────────────────────────
export { InstrumentedQueue, createInstrumentedQueue } from './instrumented-queue';
export { createInstrumentedWorker }                   from './instrumented-worker';
export {
  injectTraceparent,
  extractTraceparent,
  formatTraceparent,
  parseTraceparent,
} from './traceparent';
export type { WithTraceparent } from './traceparent';

// ── Domain job data types ────────────────────────────────────────────────────────────
export * from './types';
