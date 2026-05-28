export const QUEUES = {
  EXECUTION_DISPATCH: 'execution.dispatch',
  TOOL_ASYNC_RESULT: 'tool.async.result',
  OPS_DLQ_REPROCESS: 'ops.dlq.reprocess',
} as const;

export type QueueKey = keyof typeof QUEUES;
export type QueueName = (typeof QUEUES)[QueueKey];

export const RESERVED_QUEUES = {
  EXECUTION_RECLAIM: 'execution.reclaim',
  EXECUTION_RETRY: 'execution.retry',
  EXECUTION_CANCEL: 'execution.cancel',
  EXECUTION_RESUME: 'execution.resume',
  RUNTIME_EXECUTE: 'runtime.execute',
} as const;

export type ReservedQueueKey = keyof typeof RESERVED_QUEUES;
export type ReservedQueueName = (typeof RESERVED_QUEUES)[ReservedQueueKey];

export const QUEUE_DEFAULTS = {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
} as const;
