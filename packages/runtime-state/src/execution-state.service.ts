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
 * SEQUENCE inside transition():
 *   1. assertValidTransition(from, to)    <- FSM guard (throws on invalid)
 *   2. UPDATE executions SET status=to    <- DB write (inside caller's tx)
 *   3. INSERT execution_events            <- append event (audit trail)
 *   4. INSERT execution_steps (optional)  <- step record
 *   -> tx commits in caller
 *   -> BullMQ auto-ACK only after caller's writeBeforeAck resolves
 *
 * REPLAY IDEMPOTENCY:
 *   On replay, if currentStatus is already 'to' (double-delivery),
 *   transition() is a no-op (idempotent guard).
 */

import { assertValidTransition, ExecutionStatus, TERMINAL_STATUSES } from './transitions';

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
  /** Raw DB client that supports transactions. tx is whatever the ORM passes. */
  updateExecutionStatus(
    tx:          unknown,
    executionId: string,
    to:          ExecutionStatus,
    opts:        TransitionOpts,
  ): Promise<void>;

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
   * @param tx          Drizzle/Postgres transaction handle (from writeBeforeAck)
   * @param executionId Target execution
   * @param from        Current status (optimistic — caller reads before transition)
   * @param to          Desired next status
   * @param opts        Additional data for the event + row
   *
   * @throws InvalidTransitionError if FSM rejects the edge
   */
  async transition(
    tx:          unknown,
    executionId: string,
    from:        ExecutionStatus,
    to:          ExecutionStatus,
    opts:        TransitionOpts = {},
  ): Promise<void> {
    // Idempotency: already at target state (replay guard)
    if (from === to) return;

    // FSM guard — throws InvalidTransitionError on illegal edge
    assertValidTransition(from, to, executionId);

    // DB write — inside caller's transaction
    await this.deps.updateExecutionStatus(tx, executionId, to, opts);

    // Audit event
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
