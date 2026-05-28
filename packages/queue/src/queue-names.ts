/**
 * Legacy queue names.
 *
 * F1 runtime execution must use QUEUES from ./queues:
 *
 *   QUEUES.EXECUTION_DISPATCH = "execution.dispatch"
 *
 * QUEUE_NAMES.EXECUTION / "octo-execution" is not the F1 runtime queue and
 * must not be used by execution producers or consumers.
 */
export const QUEUE_NAMES = {
  /** F0: Validates BullMQ connectivity. Used in health checks. */
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
 * Operational queues exposed in legacy BullBoard views.
 *
 * F1 execution.dispatch metrics are reported by RuntimeModule through QUEUES,
 * not through this legacy list.
 */
export const MONITORED_QUEUES: QueueName[] = [
  QUEUE_NAMES.DELEGATION,
  QUEUE_NAMES.TOOL,
  QUEUE_NAMES.MEMORY,
  QUEUE_NAMES.DLQ_EXECUTION,
  QUEUE_NAMES.DLQ_TOOL,
];
