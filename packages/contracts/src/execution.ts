// packages/contracts/src/execution.ts
// OCTO Execution State Machine — canonical source of truth.
//
// This file is the single authority for:
//   - Status enums (ExecutionStatus, StepType, TriggerSource, DlqReason)
//   - Valid state transitions (VALID_TRANSITIONS, VALID_STEP_TRANSITIONS)
//   - Transition validators (assertValidTransition, canTransition)
//   - Runtime type contracts (ExecutionRequest, Execution, GovernancePolicy, …)
//
// ADR: F0-004 (Durable Execution), F0-007 (Replayability),
//      F0-008 (CrewAI), F0-009 (Hermes), F0-010 (Paperclip)
//
// Zero runtime dependencies — this package is pure TypeScript.
// DB enums in packages/database/src/schema mirror these values exactly.
// Any addition here MUST be accompanied by a DB migration.

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full F0 execution state machine.
 *
 * States are string literals (not numeric enums) so they are
 * legible in DB rows, logs, and over-the-wire JSON without mapping.
 *
 * Mirrored in: packages/database/src/schema/executions.ts → executionStatusEnum
 */
export const ExecutionStatus = {
  /** Created in DB, not yet enqueued in BullMQ. */
  PENDING:          'pending',
  /** BullMQ job created, worker not yet picked up. */
  QUEUED:           'queued',
  /** BullMQ job dispatched to worker, awaiting pickup. */
  DISPATCHED:       'dispatched',
  /** Worker actively processing. */
  RUNNING:          'running',
  /** Blocked on external tool response (async tool call in flight). */
  WAITING_TOOL:     'waiting_tool',
  /** Blocked on human approval gate (HITL). */
  WAITING_HUMAN:    'waiting_human',
  /** Transient failure — exponential backoff in progress. */
  RETRYING:         'retrying',
  /** Retry scheduled after backoff delay, not yet re-enqueued. */
  RETRY_SCHEDULED:  'retry_scheduled',
  /** Explicitly paused via API — resumes when PATCH /executions/:id/resume. */
  SUSPENDED:        'suspended',
  /** Lease expired, execution is reclaimable by scheduler. */
  RECLAIMABLE:      'reclaimable',
  /** Terminal: successful completion. */
  COMPLETED:        'completed',
  /** Terminal: max retries exceeded or non-retryable error. */
  FAILED:           'failed',
  /** Terminal: cancelled by user or governance policy. */
  CANCELLED:        'cancelled',
} as const;

export type ExecutionStatus = typeof ExecutionStatus[keyof typeof ExecutionStatus];

/** Ordered array — useful for iteration and Zod enums. */
export const ExecutionStatusValues = Object.values(ExecutionStatus) as ExecutionStatus[];

// ─────────────────────────────────────────────────────────────────────────────
// STATE MACHINE — VALID TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adjacency map for the F0 execution state machine.
 *
 * Key   = current status
 * Value = set of statuses the execution is allowed to move TO
 *
 * The runtime worker MUST call assertValidTransition() before every
 * status update. The control plane API also validates on PATCH.
 *
 * Diagram (text):
 *
 *   PENDING ──► QUEUED ──► DISPATCHED ──► RUNNING
 *                                               │
 *               ┌───────────────────────────────┼─────────────────────────────┐
 *               ▼                               ▼                             ▼
 *         WAITING_TOOL                    WAITING_HUMAN                 RETRYING
 *               │                               │                             │
 *               └───────────────────────────────┴──────► RUNNING ◄──────┘    │
 *                                                                              │
 *                                                            RETRY_SCHEDULED ◄─┘
 *                                                                  │
 *                                                              QUEUED
 *
 *   RUNNING ──► RECLAIMABLE ──► RETRYING (lease expired → reclaim)
 *                                    │
 *                              RETRY_SCHEDULED (scheduler picks up)
 *
 *   SUSPENDED can be reached from any non-terminal active state.
 *   CANCELLED can be reached from any non-terminal state.
 */
export const VALID_TRANSITIONS: Readonly<Record<ExecutionStatus, ReadonlySet<ExecutionStatus>>> = {
  pending: new Set([
    'queued',
    'cancelled',   // cancelled before enqueue (e.g. duplicate detected)
  ]),
  queued: new Set([
    'dispatched',  // picked up by worker
    'cancelled',   // cancelled while waiting in queue
    'failed',      // worker crashed before pickup (stale job detection)
  ]),
  dispatched: new Set([
    'running',
    'cancelled',   // cancelled before worker started processing
    'failed',      // worker failed to start
  ]),
  running: new Set([
    'waiting_tool',
    'waiting_human',
    'retrying',
    'reclaimable', // lease expired, reclaim scanner detected
    'suspended',
    'completed',
    'failed',
    'cancelled',
  ]),
  waiting_tool: new Set([
    'running',     // tool responded — resume execution
    'retrying',    // tool call failed — retry
    'failed',      // tool timeout / non-retryable error
    'cancelled',
    'suspended',
  ]),
  waiting_human: new Set([
    'running',     // approval granted
    'cancelled',   // approval denied or timeout
    'suspended',
  ]),
  retrying: new Set([
    'retry_scheduled', // backoff delay computed, retry scheduled
    'failed',          // max retries exceeded
    'cancelled',
  ]),
  retry_scheduled: new Set([
    'queued',      // re-enqueued after backoff delay
    'failed',      // max retries exceeded during scheduling
    'cancelled',
  ]),
  reclaimable: new Set([
    'retrying',    // reclaimed — will retry
    'failed',      // max reclaims exceeded
    'cancelled',
  ]),
  suspended: new Set([
    'queued',      // resumed — re-enqueue
    'cancelled',
  ]),
  // Terminal states — no outgoing transitions.
  completed: new Set<ExecutionStatus>(),
  failed:    new Set<ExecutionStatus>(),
  cancelled: new Set<ExecutionStatus>(),
};

/** Set of terminal statuses — no outgoing transitions from these. */
export const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

// ─────────────────────────────────────────────────────────────────────────────
// STATUS PREDICATES
// ─────────────────────────────────────────────────────────────────────────────

/** Terminal statuses have no valid outgoing transitions. */
export function isTerminalStatus(status: ExecutionStatus): boolean {
  return VALID_TRANSITIONS[status].size === 0;
}

/** Active: execution is being processed by a worker right now. */
export function isActiveStatus(status: ExecutionStatus): boolean {
  return status === 'running' || status === 'retrying';
}

/**
 * Blocked: execution is alive but waiting on an external signal.
 * These rows are not actively consuming worker capacity.
 */
export function isBlockedStatus(status: ExecutionStatus): boolean {
  return (
    status === 'waiting_tool' ||
    status === 'waiting_human' ||
    status === 'suspended'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown when an invalid state transition is attempted.
 * Carry from/to on the error so it can be logged with full context
 * and included in the execution event payload.
 */
export class ExecutionTransitionError extends Error {
  readonly from: ExecutionStatus;
  readonly to: ExecutionStatus;
  readonly executionId: string;

  constructor(executionId: string, from: ExecutionStatus, to: ExecutionStatus) {
    super(
      `Invalid execution transition [${executionId}]: ${from} → ${to}. ` +
      `Valid targets from '${from}': [${[...VALID_TRANSITIONS[from]].join(', ') || 'none'}]`
    );
    this.name = 'ExecutionTransitionError';
    this.from = from;
    this.to = to;
    this.executionId = executionId;
  }
}

/**
 * Alias for ExecutionTransitionError — preserves backward compatibility
 * with packages/runtime-state which used this name before consolidation.
 */
export const InvalidTransitionError = ExecutionTransitionError;
export type InvalidTransitionError = ExecutionTransitionError;

/**
 * Safe boolean predicate — does NOT throw.
 * Use in guards before attempting a transition.
 *
 * @example
 *   if (!canTransition(execution.status, 'running')) return;
 */
export function canTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

/**
 * Strict validator — throws ExecutionTransitionError on invalid move.
 * Call this inside every status-update path in the control plane and runtime.
 *
 * @example
 *   assertValidTransition(execution.id, execution.status, 'running');
 *   await db.update(executions).set({ status: 'running' });
 */
export function assertValidTransition(
  executionId: string,
  from: ExecutionStatus,
  to: ExecutionStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ExecutionTransitionError(executionId, from, to);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP TYPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execution step types — mirrors DB step_type enum.
 * Adding a new type requires:
 *   1. Add value here
 *   2. Add to DB migration (ALTER TYPE step_type ADD VALUE)
 *   3. Update runtime-worker dispatcher
 */
export const StepType = {
  LLM_CALL:      'llm_call',
  TOOL_DISPATCH: 'tool_dispatch',
  DELEGATION:    'delegation',
  REASONING:     'reasoning',
  MEMORY_READ:   'memory_read',
  MEMORY_WRITE:  'memory_write',
  EMBEDDING:     'embedding',
  CHECKPOINT:    'checkpoint',
  APPROVAL_GATE: 'approval_gate',
} as const;

export type StepType = typeof StepType[keyof typeof StepType];
export const StepTypeValues = Object.values(StepType) as StepType[];

// ─────────────────────────────────────────────────────────────────────────────
// STEP STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────

export const StepStatus = {
  PENDING:   'pending',
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  SKIPPED:   'skipped',
} as const;

export type StepStatus = typeof StepStatus[keyof typeof StepStatus];

export const VALID_STEP_TRANSITIONS: Readonly<Record<StepStatus, ReadonlySet<StepStatus>>> = {
  pending:   new Set(['running', 'skipped']),
  running:   new Set(['completed', 'failed']),
  // retried steps go through: failed → (new row with pending)
  // We create a new step row per retry instead of mutating the failed row.
  // This preserves the full retry history as immutable records.
  completed: new Set<StepStatus>(),
  failed:    new Set<StepStatus>(),
  skipped:   new Set<StepStatus>(),
};

export type StepTransition = {
  stepId: string;
  executionId: string;
  from: StepStatus;
  to: StepStatus;
};

export function canTransitionStep(from: StepStatus, to: StepStatus): boolean {
  return VALID_STEP_TRANSITIONS[from].has(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER SOURCE
// ─────────────────────────────────────────────────────────────────────────────

export const TriggerSource = {
  API:        'api',
  SCHEDULE:   'schedule',
  CHANNEL:    'channel',
  DELEGATION: 'delegation',
  REPLAY:     'replay',
} as const;

export type TriggerSource = typeof TriggerSource[keyof typeof TriggerSource];

// ─────────────────────────────────────────────────────────────────────────────
// DLQ REASON
// ─────────────────────────────────────────────────────────────────────────────

export const DlqReason = {
  MAX_RETRIES_EXCEEDED: 'max_retries_exceeded',
  NON_RETRYABLE_ERROR:  'non_retryable_error',
  GOVERNANCE_LIMIT:     'governance_limit',
  TIMEOUT:              'timeout',
  POISON_MESSAGE:       'poison_message',
  MANUAL:               'manual',
} as const;

export type DlqReason = typeof DlqReason[keyof typeof DlqReason];

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY SCOPE
// ─────────────────────────────────────────────────────────────────────────────

export const IdempotencyScope = {
  EXECUTION: 'execution',
  STEP:      'step',
  TOOL:      'tool',
  CHANNEL:   'channel',
} as const;

export type IdempotencyScope = typeof IdempotencyScope[keyof typeof IdempotencyScope];

// ─────────────────────────────────────────────────────────────────────────────
// GOVERNANCE POLICY (runtime value-object)
// ─────────────────────────────────────────────────────────────────────────────
//
// Travels in every ExecutionRequest. Different from PersistentGovernancePolicy
// in policy.ts (which is the stored config entity with an ID and timestamps).
// This is the flattened, resolved, immutable snapshot used during execution.

export interface GovernancePolicy {
  /** Paperclip: hard token limit. Execution stops when reached. */
  tokenBudget: number;
  /** Cost budget in USD. Execution stops when exceeded. Null = unlimited. */
  costBudgetUsd?: number | null;
  /** CrewAI: max_iter. Hard limit on reasoning cycles. */
  maxIterations: number;
  /** Hermes: max delegation chain depth. 0 = no delegation allowed. */
  maxDelegationDepth: number;
  /** Max steps that can run concurrently within this execution. Default: 1. */
  maxConcurrentSteps?: number;
  /** Max execution nesting depth (execution spawning executions). */
  maxExecutionDepth?: number;
  /** Whitelist of allowed tool names. Empty array = no tools permitted. */
  allowedTools: string[];
  /** Whitelist of step types allowed. Undefined = all types permitted. */
  allowedStepTypes?: StepType[];
  /** If true, APPROVAL_GATE steps will pause for human review. */
  requireApproval: boolean;
  /** Total execution wall-clock timeout in milliseconds. */
  timeoutMs: number;
  /** Per-step timeout in milliseconds. Overrides execution-level timeout for steps. */
  stepTimeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK DEFINITION
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskDefinition {
  id: string;
  /** Free-form task type string — e.g. 'research', 'summarize', 'code_review'. */
  type: string;
  input: Record<string, unknown>;
  /** CrewAI: expected_output. JSON Schema of the expected output shape. */
  expectedOutputSchema?: Record<string, unknown>;
  /** Step-level timeout override in ms. */
  timeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutionContext {
  /** ID of the parent execution in a delegation chain. */
  parentExecutionId?: string;
  /** Hermes: ordered chain of delegating agent IDs, from root to leaf. */
  delegationChain: string[];
  /** Memory scope — isolates memory state between executions. */
  memoryScope: string;
  /** Environment variables injected into the agent context. */
  variables: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION REQUEST (API → BullMQ → Python worker)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutionRequest {
  agentId: string;
  tenantId: string;
  task: TaskDefinition;
  context?: ExecutionContext;
  /** REQUIRED — Paperclip: no governance = no execution. */
  governance: GovernancePolicy;
  /** REQUIRED — W3C traceparent. Propagated to all OTEL spans. */
  traceId: string;
  /** Optional idempotency key. Duplicate requests with same key return existing execution. */
  idempotencyKey?: string;
  triggerSource?: TriggerSource;
  triggerRef?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION RECORD (DB entity)
// ─────────────────────────────────────────────────────────────────────────────

export interface Execution {
  id: string;
  tenantId: string;
  agentId: string;
  status: ExecutionStatus;
  attempt: number;
  triggerSource: TriggerSource;
  triggerRef?: string;
  task: TaskDefinition;
  governance: GovernancePolicy;
  result?: TaskResult;
  error?: ExecutionError;
  traceId: string;
  runId: string;
  /** BullMQ job ID — correlates DB row with queue job. */
  queueJobId?: string;
  /** Worker instance ID that owns this execution. */
  workerId?: string;
  idempotencyKey?: string;
  lastCheckpointId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: CostUsage;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lightweight projection for list views and UI rendering.
 * Omits large JSONB blobs (task, governance, result, error).
 */
export interface ExecutionSummary {
  id: string;
  tenantId: string;
  agentId: string;
  status: ExecutionStatus;
  triggerSource: TriggerSource;
  attempt: number;
  traceId: string;
  runId: string;
  tokenUsage?: TokenUsage;
  costUsd?: CostUsage;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK RESULT
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskResult {
  output: unknown;
  outputType: string;
  confidence?: number;
  sources?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION ERROR
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutionError {
  code: string;
  message: string;
  retryable: boolean;
  /** DLQ reason if this error terminates the execution. */
  dlqReason?: DlqReason;
  details?: Record<string, unknown>;
  /** Stack trace (redacted in production). */
  stack?: string;
  /** Chain of errors from retries. Latest first. */
  cause?: ExecutionError[];
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCE USAGE
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** LLM model that produced this usage. For cost attribution. */
  model?: string;
  /** LLM provider (openai, anthropic, etc.). */
  provider?: string;
  estimatedCostUsd?: number;
}

export interface CostUsage {
  /** Total cost in USD across all steps. */
  amountUsd: number;
  /** Breakdown by step type. */
  breakdown?: Partial<Record<StepType, number>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK (BullMQ job unit)
// ─────────────────────────────────────────────────────────────────────────────

export type TaskType =
  | 'llm_call'
  | 'tool_invocation'
  | 'memory_read'
  | 'memory_write'
  | 'delegation'
  | 'approval'
  | 'planning';

export interface Task {
  id: string;
  executionId: string;
  type: TaskType;
  payload: unknown;
  status: ExecutionStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL INVOCATION
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolInvocation {
  id: string;
  executionId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
  invokedAt: Date;
}
