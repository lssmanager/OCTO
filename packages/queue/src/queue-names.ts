/**
 * Canonical queue names for the OCTO system.
 * All queue consumers must import from here — never hardcode strings.
 *
 * Naming convention: dotted domain names with no colons.
 * BullMQ 5.x prohibits colons (:) in queue names because they are reserved
 * as Redis key separators used internally by BullMQ.
 */
export const QUEUE_NAMES = {
  /** F0: Validates BullMQ connectivity. Used in health checks. */
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

export const DLQ_SOURCE_QUEUE_KEYS = [
  'EXECUTION_DISPATCH',
  'EXECUTION_RETRY',
  'EXECUTION_RECLAIM',
  'EXECUTION_CANCEL',
  'EXECUTION_RESUME',
  'RUNTIME_EXECUTE',
  'TOOL_ASYNC_RESULT',
] as const satisfies readonly (keyof typeof QUEUE_NAMES)[];

export type DlqSourceQueueKey = (typeof DLQ_SOURCE_QUEUE_KEYS)[number];
export type SourceQueueName = (typeof QUEUE_NAMES)[DlqSourceQueueKey];
export type DlqQueueName = `${SourceQueueName}.dlq`;
export type MonitoredQueueName = QueueName | DlqQueueName;

/**
 * Ordered list of all operational queues monitored by BullBoard and
 * QueueMetricsService. Excludes HEALTH (infra validation only).
 */
export const MONITORED_QUEUES = [
  QUEUE_NAMES.EXECUTION_DISPATCH,
  QUEUE_NAMES.EXECUTION_RETRY,
  QUEUE_NAMES.EXECUTION_RECLAIM,
  QUEUE_NAMES.EXECUTION_CANCEL,
  QUEUE_NAMES.EXECUTION_RESUME,
  QUEUE_NAMES.RUNTIME_EXECUTE,
  QUEUE_NAMES.TOOL_ASYNC_RESULT,
  QUEUE_NAMES.OPS_DLQ_REPROCESS,
  `${QUEUE_NAMES.EXECUTION_DISPATCH}.dlq`,
  `${QUEUE_NAMES.EXECUTION_RETRY}.dlq`,
  `${QUEUE_NAMES.EXECUTION_RECLAIM}.dlq`,
  `${QUEUE_NAMES.EXECUTION_CANCEL}.dlq`,
  `${QUEUE_NAMES.EXECUTION_RESUME}.dlq`,
  `${QUEUE_NAMES.RUNTIME_EXECUTE}.dlq`,
  `${QUEUE_NAMES.TOOL_ASYNC_RESULT}.dlq`,
] as const satisfies readonly MonitoredQueueName[];
