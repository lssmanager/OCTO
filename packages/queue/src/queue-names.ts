/**
 * Canonical queue names for the OCTO system.
 * All queue consumers must import from here — never hardcode strings.
 *
 * Naming convention: octo:<domain>
 * F0: health (validation that BullMQ works)
 * F1+: execution, delegation, tool, memory (activated in future phases)
 *
 * PATCH 3: Added MONITORED_QUEUES — the ordered list of queues exposed
 * in BullBoard and QueueMetricsService. Derived from QUEUE_NAMES so
 * there is a single source of truth for every queue string in the system.
 */
export const QUEUE_NAMES = {
  /** F0: Validates BullMQ connectivity. Used in health checks. */
  HEALTH: 'octo:health',
  /** F1: Agent execution jobs — main orchestration queue. */
  EXECUTION: 'octo:execution',
  /** F4: Hierarchical delegation between agents. */
  DELEGATION: 'octo:delegation',
  /** F3: Tool invocation jobs. */
  TOOL: 'octo:tool',
  /** F3: Memory read/write operations. */
  MEMORY: 'octo:memory',
  /** F1: Dead-letter queue for failed executions. */
  DLQ_EXECUTION: 'octo:dlq:execution',
  /** F3: Dead-letter queue for failed tool invocations. */
  DLQ_TOOL: 'octo:dlq:tool',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Ordered list of all operational queues monitored by BullBoard and
 * QueueMetricsService. Derived from QUEUE_NAMES — never edited manually.
 *
 * Excludes HEALTH (infra validation only, not an operational queue).
 * Add new domain queues here as they are activated in F1+.
 */
export const MONITORED_QUEUES: QueueName[] = [
  QUEUE_NAMES.EXECUTION,
  QUEUE_NAMES.DELEGATION,
  QUEUE_NAMES.TOOL,
  QUEUE_NAMES.MEMORY,
  QUEUE_NAMES.DLQ_EXECUTION,
  QUEUE_NAMES.DLQ_TOOL,
];
