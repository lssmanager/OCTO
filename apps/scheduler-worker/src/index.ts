/**
 * @octo/scheduler-worker
 * Cron / delayed job scheduler — BullMQ worker
 * Full implementation: F2 milestone
 */
export const WORKER_NAME = 'scheduler-worker' as const;
export const WORKER_VERSION = '0.0.1' as const;

export type SchedulerWorkerStatus = 'idle' | 'running' | 'stopped';

export interface ScheduledJobPayload {
  readonly jobId: string;
  readonly cron?: string;
  readonly delay?: number;
  readonly payload: Record<string, unknown>;
}
