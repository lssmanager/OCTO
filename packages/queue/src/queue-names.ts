/**
 * Canonical queue names for the OCTO system.
 * All queue consumers must import from here — never hardcode strings.
 *
 * Naming convention: octo:<domain>
 * F0: health (validation that BullMQ works)
 * F1+: execution, delegation, tool, memory (activated in future phases)
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
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
