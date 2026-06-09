import { describe, expect, it } from 'vitest';
import {
  DLQ_NAMES as ContractDlqNames,
  MONITORED_QUEUES as ContractMonitoredQueues,
  QUEUE_NAMES as ContractQueueNames,
} from '../src/queue.contracts';
import { DLQ_NAMES as PackageDlqNames } from '../../queue/src/dlq-names';
import { MONITORED_QUEUES as PackageMonitoredQueues, QUEUE_NAMES as PackageQueueNames } from '../../queue/src/queue-names';
import { QUEUES } from '../../queue/src/queues';

describe('queue contract parity', () => {
  it('keeps shared queue constants aligned with the active F1 runtime queues', () => {
    expect(ContractQueueNames).toEqual(PackageQueueNames);
    expect(ContractQueueNames).toMatchObject({
      EXECUTION_DISPATCH: QUEUES.EXECUTION_DISPATCH,
      EXECUTION_RETRY: QUEUES.EXECUTION_RETRY,
      EXECUTION_RECLAIM: QUEUES.EXECUTION_RECLAIM,
      EXECUTION_CANCEL: QUEUES.EXECUTION_CANCEL,
      EXECUTION_RESUME: QUEUES.EXECUTION_RESUME,
      RUNTIME_EXECUTE: QUEUES.RUNTIME_EXECUTE,
      TOOL_ASYNC_RESULT: QUEUES.TOOL_ASYNC_RESULT,
      OPS_DLQ_REPROCESS: QUEUES.OPS_DLQ_REPROCESS,
    });
  });

  it('keeps DLQ derivation synchronized and BullMQ-safe', () => {
    expect(ContractDlqNames).toEqual(PackageDlqNames);

    for (const queueName of [
      ...Object.values(ContractQueueNames),
      ...Object.values(ContractDlqNames),
      ...ContractMonitoredQueues,
    ]) {
      expect(queueName).not.toContain(':');
    }
  });

  it('keeps monitored queues unique across contracts and package exports', () => {
    expect(ContractMonitoredQueues).toEqual(PackageMonitoredQueues);
    expect(new Set(ContractMonitoredQueues).size).toBe(ContractMonitoredQueues.length);
    expect(ContractMonitoredQueues).toContain(PackageDlqNames.EXECUTION_DISPATCH);
    expect(ContractMonitoredQueues).toContain(PackageQueueNames.OPS_DLQ_REPROCESS);
  });
});
