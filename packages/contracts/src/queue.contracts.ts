// packages/contracts/src/queue.contracts.ts
// F0/F1 queue name contracts.
//
// F1 runtime execution must use QUEUES.EXECUTION_DISPATCH from @octo/queue.
// The legacy QUEUE_NAMES.EXECUTION value is not the F1 runtime queue and must
// not be used by execution producers or consumers.

/**
 * Legacy queue name constants for OCTO message queues.
 *
 * Naming convention: octo-<domain>
 * NOTE: BullMQ 5.x prohibits colons (:) in queue names — they are reserved
 * as Redis key separators used internally by BullMQ. Always use dashes.
 */
export const QUEUE_NAMES = {
  /** F0: Infrastructure validation queue — used by health checks. */
  HEALTH: 'octo-health',
  /** Legacy/non-F1 execution queue. F1 uses QUEUES.EXECUTION_DISPATCH. */
  EXECUTION: 'octo-execution',
  /** F4: Hierarchical delegation between agents. */
  DELEGATION: 'octo-delegation',
  /** F3: Tool invocation jobs. */
  TOOL: 'octo-tool',
  /** F3: Memory read/write operations. */
  MEMORY: 'octo-memory',
  /** F1: Dead-letter queue for failed executions. */
  DLQ_EXECUTION: 'octo-dlq-execution',
  /** F3: Dead-letter queue for failed tool invocations. */
  DLQ_TOOL: 'octo-dlq-tool',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Dead-letter queue name mapping for legacy queues.
 */
export const DLQ_NAMES: Record<string, string> = {
  [QUEUE_NAMES.EXECUTION]: QUEUE_NAMES.DLQ_EXECUTION,
  [QUEUE_NAMES.TOOL]: QUEUE_NAMES.DLQ_TOOL,
} as const;

/**
 * Ordered list of legacy operational queues monitored by the dashboard.
 *
 * Excludes HEALTH (infra validation only) and QUEUE_NAMES.EXECUTION because
 * F1 execution.dispatch metrics are reported through @octo/queue QUEUES, not
 * this legacy list.
 */
export const MONITORED_QUEUES: QueueName[] = [
  QUEUE_NAMES.DELEGATION,
  QUEUE_NAMES.TOOL,
  QUEUE_NAMES.MEMORY,
  QUEUE_NAMES.DLQ_EXECUTION,
  QUEUE_NAMES.DLQ_TOOL,
];
