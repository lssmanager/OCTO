// packages/queue/src/index.ts
export { createQueue }            from './create-queue';
export { createWorker }           from './create-worker';
export { createRedisConnection }  from './connection';
export { QUEUE_NAMES }            from './queue-names';
export type { QueueName }         from './queue-names';
export type { QueueConfig }       from './create-queue';
export type { WorkerConfig }      from './create-worker';
export * from './types';

// Fix 6 + 7 — instrumented variants (OTel + traceparent)
export { InstrumentedQueue, createInstrumentedQueue } from './instrumented-queue';
export { createInstrumentedWorker }                   from './instrumented-worker';
export {
  injectTraceparent,
  extractTraceparent,
  formatTraceparent,
  parseTraceparent,
} from './traceparent';
export type { WithTraceparent } from './traceparent';
