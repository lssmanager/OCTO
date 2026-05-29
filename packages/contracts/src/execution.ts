export const ExecutionStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  DISPATCHED: 'dispatched',
  RUNNING: 'running',
  WAITING_TOOL: 'waiting_tool',
  WAITING_HUMAN: 'waiting_human',
  RETRYING: 'retrying',
  RETRY_SCHEDULED: 'retry_scheduled',
  SUSPENDED: 'suspended',
  RECLAIMABLE: 'reclaimable',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];
export const ExecutionStatusValues = Object.values(ExecutionStatus) as ExecutionStatus[];

export const VALID_TRANSITIONS: Readonly<Record<ExecutionStatus, ReadonlySet<ExecutionStatus>>> = {
  pending: new Set(['queued', 'cancelled']),
  queued: new Set(['dispatched', 'cancelled', 'failed']),
  dispatched: new Set(['running', 'cancelled', 'failed']),
  running: new Set([
    'waiting_tool',
    'waiting_human',
    'retrying',
    'reclaimable',
    'suspended',
    'completed',
    'failed',
    'cancelled',
  ]),
  waiting_tool: new Set(['running', 'retrying', 'failed', 'cancelled', 'suspended']),
  waiting_human: new Set(['running', 'cancelled', 'suspended']),
  retrying: new Set(['retry_scheduled', 'failed', 'cancelled']),
  retry_scheduled: new Set(['queued', 'failed', 'cancelled']),
  reclaimable: new Set([
    'dispatched', // canonical F1 reclaim replay handoff
    'failed',
    'cancelled',
  ]),
  suspended: new Set(['queued', 'cancelled']),
  completed: new Set<ExecutionStatus>(),
  failed: new Set<ExecutionStatus>(),
  cancelled: new Set<ExecutionStatus>(),
};

export const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export function isTerminalStatus(status: ExecutionStatus): boolean {
  return VALID_TRANSITIONS[status].size === 0;
}

export function isActiveStatus(status: ExecutionStatus): boolean {
  return status === 'running' || status === 'retrying';
}

export function isBlockedStatus(status: ExecutionStatus): boolean {
  return status === 'waiting_tool' || status === 'waiting_human' || status === 'suspended';
}

export class ExecutionTransitionError extends Error {
  readonly from: ExecutionStatus;
  readonly to: ExecutionStatus;
  readonly executionId: string;

  constructor(executionId: string, from: ExecutionStatus, to: ExecutionStatus) {
    super(
      `Invalid execution transition [${executionId}]: ${from} -> ${to}. ` +
        `Valid targets from '${from}': [${[...VALID_TRANSITIONS[from]].join(', ') || 'none'}]`
    );
    this.name = 'ExecutionTransitionError';
    this.from = from;
    this.to = to;
    this.executionId = executionId;
  }
}

export const InvalidTransitionError = ExecutionTransitionError;
export type InvalidTransitionError = ExecutionTransitionError;

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

export function assertValidTransition(executionId: string, from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransition(from, to)) {
    throw new ExecutionTransitionError(executionId, from, to);
  }
}
