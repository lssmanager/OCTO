/**
 * packages/runtime-state/src/errors.ts
 * Issue #35 — CAS-safe FSM transitions
 *
 * Error types for execution state machine conflicts.
 *
 * USAGE IN BULLMQ WORKERS:
 * -------------------------
 * catch (err) {
 *   if (err instanceof ConcurrentTransitionError) {
 *     // Expected conflict — another worker won the CAS race.
 *     // ACK the job and exit cleanly. Do NOT rethrow — retrying
 *     // would cause the same conflict or corrupt state.
 *     logger.info({ executionId: err.executionId, msg: 'fsm_conflict_acked' });
 *     return; // BullMQ treats normal return as ACK
 *   }
 *   throw err; // All other errors → BullMQ retry queue
 * }
 */

export class ConcurrentTransitionError extends Error {
  constructor(
    public readonly executionId: string,
    public readonly expectedStatus: string,
    public readonly attemptedStatus: string,
  ) {
    super(
      `FSM conflict: execution ${executionId} expected '${expectedStatus}', ` +
      `transition to '${attemptedStatus}' rejected — concurrent worker won`,
    );
    this.name = 'ConcurrentTransitionError';
    // Maintain proper prototype chain for instanceof checks across module boundaries
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
