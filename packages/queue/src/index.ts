/**
 * @octo/queue — public API
 *
 * Queue abstractions for the OCTO monorepo.
 * All BullMQ interactions must go through these exports.
 */

// Core queue/worker factories
export { createQueue }              from './create-queue';
export { createWorker }             from './create-worker';
export { createDlq }                from './create-dlq';
export type { QueueConfig }         from './create-queue';
export type { WorkerConfig }        from './create-worker';

// OTel-instrumented wrappers (preferred for all production use)
export { InstrumentedQueue, createInstrumentedQueue } from './instrumented-queue';
export { createInstrumentedWorker }                   from './instrumented-worker';

// OTEL trace propagation helpers — Issue #37
// Use these for all queue producer/consumer trace continuity.
export {
  injectOtelContext,
  extractOtelContext,
  generateCorrelationId,
} from './otel-propagation';
export type { OtelTraceFields }     from './otel-propagation';

// W3C trace carrier (legacy — prefer otel-propagation.ts for new code)
export {
  injectTraceContext,
  extractTraceContext,
} from './trace-carrier';
export type { TraceCarrier }        from './trace-carrier';

// Traceparent utilities
export {
  injectTraceparent,
  extractTraceparent,
  formatTraceparent,
  parseTraceparent,
} from './traceparent';
export type { WithTraceparent }     from './traceparent';

// Queue names + DLQ names
export { QUEUE_NAMES }              from './queue-names';
export type { QueueName }           from './queue-names';
export { DLQ_NAMES }                from './dlq-names';

// DLQ handler
export { DlqHandler }               from './dlq-handler';

// BullMQ adapters (concrete implementations of IQueue / IWorker)
export {
  BullMQQueue,
  BullMQWorker,
  BullMQQueueFactory,
  BullMQWorkerFactory,
} from './bullmq-adapter';

// Write-before-ack pattern
export { writeBeforeAck }           from './write-before-ack';
