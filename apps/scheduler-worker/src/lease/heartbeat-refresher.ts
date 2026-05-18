/**
 * apps/scheduler-worker/src/lease/heartbeat-refresher.ts
 * H1 -- Heartbeat Refresher
 *
 * Used by runtime-worker to refresh heartbeat_at + lease_expires_at
 * every 30 seconds while an execution is active.
 *
 * SQL emitted by refresh():
 *   UPDATE executions
 *   SET heartbeat_at = NOW(), lease_expires_at = NOW() + INTERVAL '90 seconds'
 *   WHERE id = $1 AND worker_id = $2 AND status = 'running'
 *
 * If UPDATE affects 0 rows: execution was reclaimed or transitioned.
 * Worker must abort via HeartbeatLostError.
 *
 * CHAOS SCENARIO PREVENTED:
 *   Worker alive but DB temporarily unavailable -> keeps retrying.
 *   If DB unreachable until lease_expires_at: scanner reclaims AND
 *   worker self-terminates on next refresh attempt (no split-brain).
 */

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const LEASE_DURATION_SEC    = 90;

export class HeartbeatLostError extends Error {
  constructor(
    public readonly executionId: string,
    public readonly workerId:    string,
  ) {
    super(
      `[heartbeat] Execution ${executionId} reclaimed while ` +
      `worker ${workerId} was running it. Worker must abort.`,
    );
    this.name = 'HeartbeatLostError';
  }
}

export interface HeartbeatRefresherDeps {
  /** Returns rows affected (1 = success, 0 = execution lost). */
  refreshHeartbeat(executionId: string, workerId: string): Promise<number>;
}

/**
 * HeartbeatRefresher -- manages the heartbeat interval for one execution.
 *
 * Usage:
 *   const hb = new HeartbeatRefresher(deps, executionId, workerId);
 *   hb.start();
 *   try {
 *     await runExecutionLogic(...);
 *   } finally {
 *     hb.stop();
 *   }
 */
export class HeartbeatRefresher {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deps:        HeartbeatRefresherDeps,
    private readonly executionId: string,
    private readonly workerId:    string,
  ) {}

  start(): void {
    if (this.timer !== null) return; // idempotent
    this.timer = setInterval(() => void this.refresh(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async refresh(): Promise<void> {
    try {
      const affected = await this.deps.refreshHeartbeat(this.executionId, this.workerId);
      if (affected === 0) {
        this.stop();
        throw new HeartbeatLostError(this.executionId, this.workerId);
      }
    } catch (err) {
      if (err instanceof HeartbeatLostError) throw err;
      // Transient DB error -- log and keep trying; do not abort yet.
      console.error('[heartbeat] transient failure', { executionId: this.executionId, err });
    }
  }
}
