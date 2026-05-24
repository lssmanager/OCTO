export const QUEUES = {
  EXECUTION_DISPATCH: 'execution.dispatch',
  EXECUTION_RETRY: 'execution.retry',
  EXECUTION_RECLAIM: 'execution.reclaim',
  EXECUTION_CANCEL: 'execution.cancel',
  EXECUTION_RESUME: 'execution.resume',
  RUNTIME_EXECUTE: 'runtime.execute',
  TOOL_ASYNC_RESULT: 'tool.async.result',
  OPS_DLQ_REPROCESS: 'ops.dlq.reprocess',
} as const;

export type QueueKey = keyof typeof QUEUES;
export type QueueName = (typeof QUEUES)[QueueKey];

export const QUEUE_DEFAULTS = {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
} as const;
