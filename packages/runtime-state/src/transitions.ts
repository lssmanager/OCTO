/**
 * packages/runtime-state/src/transitions.ts
 *
 * Single source of truth lives in @octo/contracts.
 * This file re-exports to avoid duplicate definitions.
 *
 * INVARIANT: All state machine definitions are in @octo/contracts.
 * Any transition not listed there is IMPOSSIBLE by design.
 *
 * Terminal states (completed, failed, cancelled) have no outgoing edges.
 * Attempting to write status directly via Drizzle outside this package
 * is blocked by the ESLint rule: no-raw-execution-status-write
 * (see eslint-rules/no-raw-execution-status-write.js)
 */

export {
  VALID_TRANSITIONS,
  assertValidTransition,
  InvalidTransitionError,
  TERMINAL_STATUSES,
} from '@octo/contracts';
export type { ExecutionStatus } from '@octo/contracts';
