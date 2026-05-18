/**
 * Dead Letter Queue names — auto-derived from QUEUE_NAMES.
 *
 * For every queue in QUEUE_NAMES, a corresponding DLQ is created
 * with the prefix `dlq:`. Adding a new queue to QUEUE_NAMES
 * automatically produces its DLQ here — no manual update required.
 *
 * Example:
 *   QUEUE_NAMES.EXECUTION = 'octo:execution'
 *   DLQ_NAMES.EXECUTION   = 'dlq:octo:execution'
 */
import { QUEUE_NAMES } from './queue-names';
import type { QueueName } from './queue-names';

export type DlqNames = {
  readonly [K in keyof typeof QUEUE_NAMES]: `dlq:${(typeof QUEUE_NAMES)[K]}`;
};

export const DLQ_NAMES = Object.fromEntries(
  Object.entries(QUEUE_NAMES).map(([key, value]) => [key, `dlq:${value}`]),
) as DlqNames;

export type DlqName = DlqNames[keyof DlqNames];

/**
 * Returns the DLQ name for a given source queue name.
 * Throws if the source queue has no corresponding DLQ entry.
 */
export function getDlqName(sourceQueue: QueueName): DlqName {
  const entry = Object.entries(QUEUE_NAMES).find(([, v]) => v === sourceQueue);
  if (!entry) {
    throw new Error(`[octo:dlq] No DLQ mapping found for queue: ${sourceQueue}`);
  }
  return DLQ_NAMES[entry[0] as keyof DlqNames];
}
