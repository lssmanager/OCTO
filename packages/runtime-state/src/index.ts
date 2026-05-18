/**
 * @octo/runtime-state
 *
 * Execution state machine — the ONLY authority for status transitions.
 *
 * ARCHITECTURAL RULE (H5):
 *   All execution status writes MUST go through ExecutionStateService.transition().
 *   Direct db.update(executions).set({ status: ... }) is forbidden outside this
 *   package and blocked by ESLint rule: no-raw-execution-status-write
 *
 * CAS SAFETY (Issue #35):
 *   ExecutionStateService.transition() performs a compare-and-swap update.
 *   Callers must handle ConcurrentTransitionError and ACK without retry.
 */
export { ExecutionStateService } from './execution-state.service';
export { ConcurrentTransitionError } from './errors';
export {
  assertValidTransition,
  InvalidTransitionError,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
} from './transitions';
export type { ExecutionStatus } from './transitions';
export type { TransitionOpts, StateServiceDeps } from './execution-state.service';
