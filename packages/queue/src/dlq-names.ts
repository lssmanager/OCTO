/**
 * Dead-letter queue names derived from active F1 source queues.
 *
 * BullMQ queue names must stay colon-free, so DLQs use the suffix `.dlq`
 * instead of the legacy `dlq:` prefix.
 */
import {
  DLQ_SOURCE_QUEUE_KEYS,
  QUEUE_NAMES,
  type DlqQueueName,
  type DlqSourceQueueKey,
  type QueueName,
} from './queue-names';

export type DlqNames = {
  readonly [K in DlqSourceQueueKey]: `${(typeof QUEUE_NAMES)[K]}.dlq`;
};

export const DLQ_NAMES = Object.fromEntries(
  DLQ_SOURCE_QUEUE_KEYS.map((key) => [key, `${QUEUE_NAMES[key]}.dlq`])
) as DlqNames;

export type DlqName = DlqNames[keyof DlqNames];

/**
 * Returns the DLQ name for a given source queue name.
 * Throws if the source queue is not DLQ-backed in F1.
 */
export function getDlqName(sourceQueue: QueueName): DlqName {
  const key = DLQ_SOURCE_QUEUE_KEYS.find((candidate) => QUEUE_NAMES[candidate] === sourceQueue);
  if (!key) {
    throw new Error(`[octo:dlq] No DLQ mapping found for queue: ${sourceQueue}`);
  }
  return DLQ_NAMES[key] as DlqQueueName;
}
