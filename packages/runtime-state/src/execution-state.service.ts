/**
 * packages/runtime-state/src/execution-state.service.ts
 * H5 — ExecutionStateService
 *
 * THE ONLY PLACE where execution.status may be written to Postgres.
 *
 * All callers must use:
 *   stateService.transition(tx, executionId, currentStatus, nextStatus, opts)
 *
 * The ESLint rule no-raw-execution-status-write blocks any attempt to write
 * status outside this service at lint time.
 *
 * CAS PATTERN (Issue #35):
 *   transition() performs a compare-and-swap at the DB layer:
 *
 *     UPDATE executions
 *     SET    status = $nextStatus, updatedAt = NOW()
 *     WHERE  id = $executionId
 *     AND    status = $currentStatus    ← the CAS guard
 *     RETURNING id;
 *
 *   If 0 rows are returned, another worker already transitioned the execution.
 *   transition() throws ConcurrentTransitionError — callers (BullMQ workers)
 *   must catch it, log 'fsm_conflict_acked', and return WITHOUT rethrowing.
 *
 * SEQUENCE inside transition():
 *   1. Idempotency guard: if from === to, return (replay protection)
 *   2. assertValidTransition(from, to)    ← FSM edge guard (throws on invalid)
 *   3. CAS UPDATE via deps.updateExecutionStatus(from, to)
 *      → returns false if WHERE status=from matched 0 rows
 *   4. Throw ConcurrentTransitionError if CAS lost
 *   5. INSERT execution_events            ← append to audit trail
 *   6. INSERT execution_steps (optional)  ← step record
 *   → tx commits in caller
 *   → BullMQ auto-ACK only after caller’s writeBeforeAck resolves
 */

import { assertValidTransition, ExecutionStatus, TERMINAL_STATUSES } from './transitions';
import { ConcurrentTransitionError } from './errors';

export interface TransitionOpts {
  readonly workerId?:     string;
  readonly result?:       unknown;
  readonly error?:        unknown;
  readonly checkpoint?:   unknown;
  readonly stepName?:     string;
  readonly stepPayload?:  unknown;
  /** Heartbeat + lease update — set true when acquiring execution. */
  readonly acquireLease?: boolean;
  readonly leaseSec?:     number; // default 90
}

export interface StateServiceDeps {
  /**
   * CAS update: set status = to WHERE id = executionId AND status = from.
   *
   * REQUIRED IMPLEMENTATION:
   *   const rows = await db
   *     .update(executions)
   *     .set({ status: to, updatedAt: new Date() })
   *     .where(and(
   *       eq(executions.id, executionId),
   *       eq(executions.status, from),   // ← CAS guard
   *     ))
   *     .returning({ id: executions.id });
   *   return rows.length > 0;
   *
   * Returns true  → CAS succeeded (this worker owns the transition)
   * Returns false → CAS lost (another worker already changed the status)
   */
  updateExecutionStatus(
    tx:          unknown,
    executionId: string,
    from:        ExecutionStatus,
    to:          ExecutionStatus,
    opts:        TransitionOpts,
  ): Promise<boolean>;

  appendExecutionEvent(
    tx:          unknown,
    executionId: string,
    eventType:   string,
    payload:     unknown,
  ): Promise<void>;
}

export class ExecutionStateService {
  constructor(private readonly deps: StateServiceDeps) {}

  /**
   * transition — the ONLY public API for changing execution status.
   *
   * Performs a compare-and-swap update. If the CAS check fails (0 rows
   * updated), throws ConcurrentTransitionError.
   *
   * BullMQ workers MUST catch ConcurrentTransitionError and ACK without retry:
   *   catch (err) {
   *     if (err instanceof ConcurrentTransitionError) {
   *       logger.info({ msg: 'fsm_conflict_acked', executionId });
   *       return; // NOT throw
   *     }
   *     throw err;
   *   }
   *
   * @param tx          Drizzle/Postgres transaction handle
   * @param executionId Target execution
   * @param from        Expected current status (the CAS check value)
   * @param to          Desired next status
   * @param opts        Additional data for the event + row
   *
   * @throws InvalidTransitionError      if FSM rejects the edge (from → to)
   * @throws ConcurrentTransitionError   if CAS lost (another worker won)
   */
  async transition(
    tx:          unknown,
    executionId: string,
    from:        ExecutionStatus,
    to:          ExecutionStatus,
    opts:        TransitionOpts = {},
  ): Promise<void> {
    // 1. Idempotency: already at target state (replay guard for double-delivery)
    if (from === to) return;

    // 2. FSM guard — throws InvalidTransitionError on illegal edge
    assertValidTransition(from, to, executionId);

    // 3. CAS DB write — WHERE status = from ensures atomic compare-and-swap.
    //    Returns false if another worker already changed the status.
    const won = await this.deps.updateExecutionStatus(tx, executionId, from, to, opts);

    // 4. CAS lost — another worker transitioned first. Throw so callers ACK cleanly.
    if (!won) {
      throw new ConcurrentTransitionError(executionId, from, to);
    }

    // 5. Audit event — only appended when this worker won the CAS
    await this.deps.appendExecutionEvent(tx, executionId, `execution.${from}_to_${to}`, {
      from,
      to,
      workerId:   opts.workerId,
      stepName:   opts.stepName,
      hasError:   !!opts.error,
      hasResult:  !!opts.result,
      checkpoint: !!opts.checkpoint,
      timestamp:  new Date().toISOString(),
    });
  }

  isTerminal(status: ExecutionStatus): boolean {
    return TERMINAL_STATUSES.has(status);
  }
}
