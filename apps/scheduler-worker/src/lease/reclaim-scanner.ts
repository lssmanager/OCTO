/**
 * apps/scheduler-worker/src/lease/reclaim-scanner.ts
 * H1 -- Reclaim Scanner
 *
 * Scans for executions whose lease_expires_at has passed while still
 * in status='running'. These belong to presumed-dead workers.
 *
 * Recovery flow per stale execution:
 *   1. Append ExecutionReclaimedByScanner event to execution_events
 *   2. Increment attempt counter
 *   3. Clear worker_id + heartbeat_at + lease_expires_at
 *   4. Set status = 'retrying'
 *   5. Re-enqueue replay job in BullMQ
 *
 * Safety invariants:
 *   - Optimistic ownership: WHERE worker_id = $expected prevents double-reclaim
 *   - All operations idempotent: WHERE status='running' AND lease_expires_at < NOW()
 *   - Max RECLAIM_BATCH_SIZE rows per tick to bound write amplification
 *
 * CHAOS SCENARIO PREVENTED:
 *   Worker pod OOMKilled mid-execution -> execution stays 'running' forever.
 *   With this scanner: after 90s, execution moves to 'retrying' and is
 *   re-enqueued for a healthy worker.
 */

export const RECLAIM_INTERVAL_MS = 30_000; // check every 30s
export const LEASE_DURATION_S = 90; // lease window in seconds
export const HEARTBEAT_INTERVAL_S = 30; // worker must refresh every 30s
export const RECLAIM_BATCH_SIZE = 100; // max rows per scan tick

export interface StaleExecutionRow {
  readonly id: string;
  readonly workerId: string | null;
  readonly attempt: number;
  readonly traceId: string;
  readonly tenantId: string;
  readonly leaseExpiresAt: Date | null;
}

export interface ReclaimResult {
  readonly executionId: string;
  readonly oldWorkerId: string | null;
  readonly newAttempt: number;
  readonly reclaimedAt: Date;
}

export interface ReclaimScannerDeps {
  /** Returns up to `limit` executions where status='running' AND lease_expires_at < NOW() */
  findStaleExecutions(limit: number): Promise<StaleExecutionRow[]>;

  /**
   * Atomically reclaims a single stale execution inside a DB transaction.
   * Returns null if already reclaimed (idempotency).
   */
  reclaimExecution(
    executionId: string,
    expectedWorkerId: string | null
  ): Promise<ReclaimResult | null>;

  /** Appends reclaim event to execution_events (called inside same tx). */
  appendReclaimEvent(executionId: string, result: ReclaimResult): Promise<void>;

  /**
   * Re-enqueues a replay job.
   * Called AFTER DB transaction commits (write-before-ACK discipline).
   */
  enqueueReplay(executionId: string, attempt: number, traceId: string): Promise<void>;
}

/**
 * runReclaimScan -- core logic, fully injectable.
 * Called on a 30s interval by the scheduler-worker main loop.
 */
export async function runReclaimScan(
  deps: ReclaimScannerDeps,
  batchSize: number = RECLAIM_BATCH_SIZE
): Promise<string[]> {
  const stale = await deps.findStaleExecutions(batchSize);
  if (stale.length === 0) return [];

  const reclaimed: string[] = [];

  for (const row of stale) {
    try {
      const result = await deps.reclaimExecution(row.id, row.workerId);
      if (result === null) continue; // already reclaimed by another scanner pod

      await deps.appendReclaimEvent(row.id, result);

      // Re-enqueue AFTER successful DB commit.
      // If this throws, execution stays 'retrying' and reconciler (H3) picks it up.
      await deps.enqueueReplay(row.id, result.newAttempt, row.traceId);

      reclaimed.push(row.id);
    } catch (err) {
      // Log + continue -- one failed reclaim must not abort the batch.
      console.error('[reclaim-scanner] failed to reclaim', { executionId: row.id, err });
    }
  }

  return reclaimed;
}
