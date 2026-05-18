/**
 * apps/scheduler-worker/src/reconciliation/execution-reconciler.ts
 * H3 -- Execution Reconciler
 *
 * Heals inconsistencies between BullMQ state and PostgreSQL state.
 * Runs on RECONCILER_INTERVAL_MS (default 60s).
 *
 * CASE 1 -- DB says 'running', BullMQ has no active job
 *   Cause:  BullMQ job lost (Redis crash, key eviction).
 *   Action: Re-enqueue as replay job.
 *
 * CASE 2 -- BullMQ ACTIVE, execution missing from DB
 *   Cause:  Data corruption (DB write never persisted).
 *   Action: Move job to DLQ + emit critical alert.
 *
 * CASE 3 -- Stuck in 'retrying' beyond max attempts
 *   Cause:  Partial write or crash between steps.
 *   Action: Transition to 'failed', write to execution_dlq.
 *
 * All operations are idempotent: conditional WHERE clauses are no-ops
 * if the case was already resolved.
 *
 * CHAOS SCENARIO PREVENTED:
 *   Redis keyspace eviction wipes BullMQ job while execution is 'running'.
 *   Without reconciler: zombie forever.
 *   With reconciler: detected within RECONCILER_INTERVAL_MS, re-enqueued.
 */

export const RECONCILER_INTERVAL_MS = 60_000;
export const RECONCILER_BATCH_SIZE  = 50;

export type ReconcilerCase =
  | 'db-running-queue-missing'
  | 'queue-active-db-missing'
  | 'stuck-retrying';

export interface ReconcilerOutcome {
  readonly case:        ReconcilerCase;
  readonly executionId: string;
  readonly action:      're-enqueued' | 'moved-to-dlq' | 'marked-failed' | 'alerted';
  readonly resolvedAt:  Date;
}

export interface ReconcilerDeps {
  /** Returns executions in 'running'/'retrying' with no corresponding active BullMQ job. */
  findOrphaned(): Promise<Array<{
    id:          string;
    status:      string;
    attempt:     number;
    maxAttempts: number;
    traceId:     string;
  }>>;

  /** Returns BullMQ job IDs ACTIVE but with no matching execution row in Postgres. */
  findGhostJobs(): Promise<Array<{ jobId: string; queueName: string }>>;

  /** Re-enqueues an orphaned execution as a replay job. */
  reEnqueue(executionId: string, traceId: string): Promise<void>;

  /** Moves a ghost BullMQ job to the DLQ and emits an alert. */
  moveToDlq(jobId: string, queueName: string, reason: string): Promise<void>;

  /** Transitions a stuck 'retrying' execution to 'failed' + inserts to execution_dlq. */
  markFailed(executionId: string, reason: string): Promise<void>;
}

export async function runReconciliation(deps: ReconcilerDeps): Promise<ReconcilerOutcome[]> {
  const outcomes: ReconcilerOutcome[] = [];
  const now = new Date();

  // Cases 1 + 3: orphaned DB executions
  const orphaned = await deps.findOrphaned();
  for (const exec of orphaned) {
    try {
      if (exec.status === 'retrying' && exec.attempt >= exec.maxAttempts) {
        await deps.markFailed(exec.id, `max_attempts_exceeded:${exec.attempt}`);
        outcomes.push({ case: 'stuck-retrying', executionId: exec.id, action: 'marked-failed', resolvedAt: now });
      } else {
        await deps.reEnqueue(exec.id, exec.traceId);
        outcomes.push({ case: 'db-running-queue-missing', executionId: exec.id, action: 're-enqueued', resolvedAt: now });
      }
    } catch (err) {
      console.error('[reconciler] failed to reconcile orphaned execution', { executionId: exec.id, err });
    }
  }

  // Case 2: ghost BullMQ jobs
  const ghosts = await deps.findGhostJobs();
  for (const ghost of ghosts) {
    try {
      await deps.moveToDlq(ghost.jobId, ghost.queueName, 'execution_row_missing_from_db');
      outcomes.push({ case: 'queue-active-db-missing', executionId: ghost.jobId, action: 'moved-to-dlq', resolvedAt: now });
    } catch (err) {
      console.error('[reconciler] failed to process ghost job', { jobId: ghost.jobId, err });
    }
  }

  return outcomes;
}
