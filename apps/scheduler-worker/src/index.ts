/**
 * @octo/scheduler-worker
 *
 * Scheduler + Hardening worker. Hosts:
 *   - Cron / delayed job scheduling (F2)
 *   - H1: Lease reclaim scanner (zombie execution prevention)
 *   - H3: Execution reconciler (BullMQ <-> Postgres consistency)
 *
 * Architectural constraints:
 *   - Control Plane maintenance worker only.
 *   - No business logic, no agent orchestration.
 *   - All DB writes through @octo/database.
 *   - All queue ops through @octo/queue interfaces.
 */
export { runReclaimScan, RECLAIM_INTERVAL_MS, RECLAIM_BATCH_SIZE } from './lease/reclaim-scanner';
export {
  HeartbeatRefresher,
  HeartbeatLostError,
  HEARTBEAT_INTERVAL_MS,
} from './lease/heartbeat-refresher';
export { runReconciliation, RECONCILER_INTERVAL_MS } from './reconciliation/execution-reconciler';
export type { StaleExecutionRow, ReclaimResult, ReclaimScannerDeps } from './lease/reclaim-scanner';
export type {
  ReconcilerDeps,
  ReconcilerOutcome,
  ReconcilerCase,
} from './reconciliation/execution-reconciler';
export type { HeartbeatRefresherDeps } from './lease/heartbeat-refresher';

export const WORKER_NAME = 'scheduler-worker' as const;
export const WORKER_VERSION = '0.1.0' as const;

export type SchedulerWorkerStatus = 'idle' | 'running' | 'stopped';

export interface ScheduledJobPayload {
  readonly jobId: string;
  readonly cron?: string;
  readonly delay?: number;
  readonly payload: Record<string, unknown>;
}
