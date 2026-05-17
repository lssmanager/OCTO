// @octo/queue — BullMQ queue primitives
//
// Design constraints (OCTO Architecture Principle #1):
// - NO dependency on @nestjs/* — usable from any service (control plane, workers, scripts)
// - NO dependency on @octo/database — control plane handles persistence
// - Producers live in control plane (NestJS API)
// - Consumers (Workers) live in runtime-worker (Python via bullmq-compatible protocol) or NestJS
//
// Redis is used ONLY for: BullMQ queues, transient locks, rate limiting, short-lived cache.
// Redis is NOT for: execution persistence, memory records, sessions, event sourcing.

export { QUEUE_NAMES, type QueueName } from './queue-names';
export { createQueue, type QueueConfig } from './create-queue';
export { createWorker, type WorkerConfig } from './create-worker';
export { createRedisConnection } from './connection';
export type {
  HealthJobData,
  ExecutionJobData,
  DelegationJobData,
  ToolJobData,
  MemoryJobData,
} from './types';
