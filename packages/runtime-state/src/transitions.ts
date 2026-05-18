/**
 * packages/runtime-state/src/transitions.ts
 * H5 — Execution FSM: valid transition map + guard.
 *
 * INVARIANT: This map is the ONLY place that defines legal state transitions.
 * Any transition not listed here is IMPOSSIBLE by design.
 *
 * Terminal states (completed, failed, cancelled) have no outgoing edges.
 * Attempting to write status directly via Drizzle outside this package
 * is blocked by the ESLint rule: no-raw-execution-status-write
 * (see eslint-rules/no-raw-execution-status-write.js)
 */

export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_tool'
  | 'waiting_human'
  | 'retrying'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TERMINAL_STATUSES = new Set<ExecutionStatus>([
  'completed',
  'failed',
  'cancelled',
]);

/**
 * VALID_TRANSITIONS[from] = Set of valid 'to' values.
 *
 * Missing key = terminal state (no outgoing transitions).
 */
export const VALID_TRANSITIONS: Readonly<Record<string, ReadonlySet<ExecutionStatus>>> = {
  pending:       new Set(['queued', 'cancelled']),
  queued:        new Set(['running', 'cancelled', 'failed']),
  running:       new Set(['waiting_tool', 'waiting_human', 'retrying', 'suspended', 'completed', 'failed', 'cancelled']),
  waiting_tool:  new Set(['running', 'retrying', 'failed', 'cancelled']),
  waiting_human: new Set(['running', 'cancelled', 'failed']),
  retrying:      new Set(['queued', 'running', 'failed', 'cancelled']),
  suspended:     new Set(['queued', 'cancelled']),
  // completed, failed, cancelled: terminal — no entries
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from:        ExecutionStatus,
    public readonly to:          ExecutionStatus,
    public readonly executionId: string,
  ) {
    super(
      `[state-machine] Invalid transition ${from} -> ${to} ` +
      `for execution ${executionId}. ` +
      `Allowed from '${from}': [${[...(VALID_TRANSITIONS[from] ?? [])].join(', ')}]`,
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * assertValidTransition — call before every status write.
 * @throws InvalidTransitionError if transition is illegal.
 */
export function assertValidTransition(
  from:        ExecutionStatus,
  to:          ExecutionStatus,
  executionId: string,
): void {
  if (TERMINAL_STATUSES.has(from)) {
    throw new InvalidTransitionError(from, to, executionId);
  }
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.has(to)) {
    throw new InvalidTransitionError(from, to, executionId);
  }
}
