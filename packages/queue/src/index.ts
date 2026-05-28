/**
 * @octo/queue — public API
 *
 * Queue abstractions for the OCTO monorepo.
 * All BullMQ interactions must go through these exports.
 */

// Core queue/worker factories
export { createQueue } from './create-queue';
export { createWorker } from './create-worker';
export { createDlq } from './create-dlq';
export type { QueueConfig } from './create-queue';
export type { WorkerConfig } from './create-worker';

// Redis connection (used by health checks and standalone probe connections)
export { createRedisConnection } from './connection';

// Domain job data types (contracts between producers and consumers)
export type { HealthJobData } from './types';
export type { ExecutionJobData } from './types';
export type { DelegationJobData } from './types';

// OTel-instrumented wrappers (preferred for all production use)
export { InstrumentedQueue, createInstrumentedQueue } from './instrumented-queue';
export { createInstrumentedWorker } from './instrumented-worker';

// OTEL trace propagation helpers — Issue #37
// Use these for all queue producer/consumer trace continuity.
export { injectOtelContext, extractOtelContext, generateCorrelationId } from './otel-propagation';
export type { OtelTraceFields } from './otel-propagation';

// W3C trace carrier (legacy — prefer otel-propagation.ts for new code)
export { injectTraceContext, extractTraceContext } from './trace-carrier';
export type { TraceCarrier } from './trace-carrier';

// Traceparent utilities
export {
  injectTraceparent,
  extractTraceparent,
  formatTraceparent,
  parseTraceparent,
} from './traceparent';
export type { WithTraceparent } from './traceparent';

// Queue names + DLQ names
export { QUEUE_NAMES } from './queue-names';
export type { QueueName as LegacyQueueName } from './queue-names';
export { DLQ_NAMES } from './dlq-names';

// MONITORED_QUEUES — re-exported from queue-names (local source of truth)
export { MONITORED_QUEUES } from './queue-names';

// DLQ handler
export { DlqHandler } from './dlq-handler';

// BullMQ adapters (concrete implementations of IQueue / IWorker)
export {
  BullMQQueue,
  BullMQWorker,
  BullMQQueueFactory,
  BullMQWorkerFactory,
} from './bullmq-adapter';

// Write-before-ack pattern
export { writeBeforeAck } from './write-before-ack';

export { QUEUES, RESERVED_QUEUES, QUEUE_DEFAULTS } from './queues';
export type { QueueKey, QueueName, ReservedQueueKey, ReservedQueueName } from './queues';
