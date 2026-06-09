// packages/contracts/src/queue.contracts.ts
// F1: Canonical queue name contracts — single source of truth for queue identifiers.
//
// All BullMQ consumers/producers MUST import queue names from this module or
// from @octo/queue (which re-exports these names).
// Hardcoded queue strings outside this file are blocked by the eslint
// boundaries rule (element-types: leaf → infra boundary).
//
// ADR: F0-003 (Queue Architecture), F0-004 (Durable Execution)

/**
 * Canonical queue name constants for every active F1 BullMQ queue.
 *
 * Naming convention: dotted domain names with no colons.
 * BullMQ 5.x prohibits colons (:) in queue names because they are reserved
 * as Redis key separators used internally by BullMQ.
 */
export const QUEUE_NAMES = {
  /** F0: Infrastructure validation queue — used by health checks. */
  HEALTH: 'octo-health',
  /** F1: Control-plane dispatch queue for execution jobs. */
  EXECUTION_DISPATCH: 'execution.dispatch',
  /** F1: Retry scheduling queue for failed executions. */
  EXECUTION_RETRY: 'execution.retry',
  /** F1: Reclaim queue for stale runtime ownership recovery. */
  EXECUTION_RECLAIM: 'execution.reclaim',
  /** F1: Cancellation queue for in-flight executions. */
  EXECUTION_CANCEL: 'execution.cancel',
  /** F1: Resume queue for approved / resumed executions. */
  EXECUTION_RESUME: 'execution.resume',
  /** F1: Runtime-worker execution queue. */
  RUNTIME_EXECUTE: 'runtime.execute',
  /** F1: Async tool result fan-in queue. */
  TOOL_ASYNC_RESULT: 'tool.async.result',
  /** F1: Operational reprocessor for dead-letter jobs. */
  OPS_DLQ_REPROCESS: 'ops.dlq.reprocess',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const DLQ_SOURCE_QUEUE_KEYS = [
  'EXECUTION_DISPATCH',
  'EXECUTION_RETRY',
  'EXECUTION_RECLAIM',
  'EXECUTION_CANCEL',
  'EXECUTION_RESUME',
  'RUNTIME_EXECUTE',
  'TOOL_ASYNC_RESULT',
] as const satisfies readonly (keyof typeof QUEUE_NAMES)[];

type DlqSourceQueueKey = (typeof DLQ_SOURCE_QUEUE_KEYS)[number];

type DlqNames = {
  readonly [K in DlqSourceQueueKey]: `${(typeof QUEUE_NAMES)[K]}.dlq`;
};

/**
 * Dead-letter queue name mapping.
 * Only execution/runtime source queues receive a DLQ in F1.
 */
export const DLQ_NAMES = Object.fromEntries(
  DLQ_SOURCE_QUEUE_KEYS.map((key) => [key, `${QUEUE_NAMES[key]}.dlq`])
) as DlqNames;

/**
 * Ordered list of operational queues monitored by the dashboard.
 * Excludes HEALTH (infra validation only, not an operational queue).
 */
export const MONITORED_QUEUES: string[] = [
  QUEUE_NAMES.EXECUTION_DISPATCH,
  QUEUE_NAMES.EXECUTION_RETRY,
  QUEUE_NAMES.EXECUTION_RECLAIM,
  QUEUE_NAMES.EXECUTION_CANCEL,
  QUEUE_NAMES.EXECUTION_RESUME,
  QUEUE_NAMES.RUNTIME_EXECUTE,
  QUEUE_NAMES.TOOL_ASYNC_RESULT,
  QUEUE_NAMES.OPS_DLQ_REPROCESS,
  DLQ_NAMES.EXECUTION_DISPATCH,
  DLQ_NAMES.EXECUTION_RETRY,
  DLQ_NAMES.EXECUTION_RECLAIM,
  DLQ_NAMES.EXECUTION_CANCEL,
  DLQ_NAMES.EXECUTION_RESUME,
  DLQ_NAMES.RUNTIME_EXECUTE,
  DLQ_NAMES.TOOL_ASYNC_RESULT,
];
