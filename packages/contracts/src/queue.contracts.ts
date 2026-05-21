// packages/contracts/src/queue.contracts.ts
// F0: Canonical queue name contracts — single source of truth for queue identifiers.
//
// All BullMQ consumers/producers MUST import queue names from this module or
// from @octo/queue (which re-exports these names).
// Hardcoded queue strings outside this file are blocked by the eslint
// boundaries rule (element-types: leaf → infra boundary).
//
// ADR: F0-003 (Queue Architecture), F0-004 (Durable Execution)

/**
 * Canonical queue name constants for every OCTO message queue.
 *
 * Naming convention: octo-<domain>
 * NOTE: BullMQ 5.x prohibits colons (:) in queue names — they are reserved
 * as Redis key separators used internally by BullMQ. Always use dashes.
 *
 * Architecture rule:
 *   Queue names defined here are the ONLY valid BullMQ queue names in the system.
 *   Any code that creates a Queue or Worker MUST reference one of these constants.
 */
export const QUEUE_NAMES = {
  /** F0: Infrastructure validation queue — used by health checks. */
  HEALTH: 'octo-health',
  /** F1: Agent execution jobs — main orchestration queue. */
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
 * Dead-letter queue name mapping.
 * Every operational queue has a corresponding DLQ for poison-pill handling.
 */
export const DLQ_NAMES: Record<string, string> = {
  [QUEUE_NAMES.EXECUTION]: QUEUE_NAMES.DLQ_EXECUTION,
  [QUEUE_NAMES.TOOL]: QUEUE_NAMES.DLQ_TOOL,
} as const;

/**
 * Ordered list of operational queues monitored by the dashboard.
 * Excludes HEALTH (infra validation only, not an operational queue).
 */
export const MONITORED_QUEUES: QueueName[] = [
  QUEUE_NAMES.EXECUTION,
  QUEUE_NAMES.DELEGATION,
  QUEUE_NAMES.TOOL,
  QUEUE_NAMES.MEMORY,
  QUEUE_NAMES.DLQ_EXECUTION,
  QUEUE_NAMES.DLQ_TOOL,
];
