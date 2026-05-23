/**
 * F0-009 — Hermes Coordinator Patterns
 * Source of truth: ADR F0-009-hermes-coordinator-patterns.md
 *
 * Covers:
 *  - ICoordinatorAgent
 *  - TaskDecomposition, Subtask
 *  - ConsolidationStrategy
 *  - ISession, IRoutine
 *  - Checkpoint / resume semantics for hierarchical coordination
 */

import type { IAgentProfile } from '../agents/agent-profile';

// ─────────────────────────────────────────────────────────────────────────────
// Subtask
// ─────────────────────────────────────────────────────────────────────────────

export type SubtaskStatus =
  | 'pending'
  | 'assigned'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'replanning';

export interface Subtask {
  id: string;
  /** Human-readable label */
  title: string;
  description: string;
  /** Agent assigned to execute this subtask */
  assignedAgentId?: string;
  /** Dependencies — subtask ids that must complete first */
  dependsOn?: string[];
  status: SubtaskStatus;
  /** ISO 8601 deadline */
  deadline?: string;
  /** Input context injected to the assigned agent */
  inputContext?: Record<string, unknown>;
  /** Output produced by the assigned agent */
  outputContext?: Record<string, unknown>;
  /** Number of replanning attempts */
  replanningCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Decomposition
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskDecomposition {
  id: string;
  /** Parent run id this decomposition belongs to */
  runId: string;
  /** The original goal received by the coordinator */
  originalGoal: string;
  subtasks: Subtask[];
  /** Version — incremented on each replanning */
  version: number;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidation Strategy
// ─────────────────────────────────────────────────────────────────────────────

export type ConsolidationMode =
  | 'merge-sequential' // outputs appended in dependency order
  | 'merge-parallel' // outputs merged from parallel subtasks
  | 'llm-synthesis' // coordinator LLM synthesises all outputs
  | 'vote' // majority vote across agent outputs
  | 'first-success' // use first subtask that succeeds
  | 'custom'; // custom handler registered in the runtime

export interface ConsolidationStrategy {
  mode: ConsolidationMode;
  /** For llm-synthesis: system prompt used by the coordinator */
  synthesisPrompt?: string;
  /** For vote: minimum agreement threshold (0–1) */
  voteThreshold?: number;
  /** For custom: handler id registered in the strategy registry */
  customHandlerId?: string;
  /** Max tokens for the final consolidated output */
  maxOutputTokens?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'idle' | 'completed' | 'abandoned';

export interface ISession {
  id: string;
  /** Coordinator agent id */
  coordinatorAgentId: string;
  /** Human operator or upstream agent that initiated the session */
  initiatedBy: string;
  /** Workspace scope */
  workspaceId: string;
  status: SessionStatus;
  /** Current active decomposition */
  decompositionId?: string;
  /** Accumulated context visible to the coordinator */
  sharedContext: Record<string, unknown>;
  /** ISO 8601 */
  startedAt: string;
  lastActiveAt: string;
  endedAt?: string;
  /** Memory snapshot id for resumption */
  checkpointId?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routine
// ─────────────────────────────────────────────────────────────────────────────

export type RoutineType = 'cron' | 'event-driven' | 'heartbeat' | 'manual';
export type RoutineStatus = 'active' | 'paused' | 'archived';

export interface IRoutine {
  id: string;
  name: string;
  description?: string;
  type: RoutineType;
  /** Cron expression — required when type === 'cron' */
  cronExpression?: string;
  /** Event that triggers the routine — required when type === 'event-driven' */
  triggerEvent?: string;
  /** Agent or flow to invoke */
  targetId: string;
  targetType: 'agent' | 'flow';
  /** Level that owns this routine */
  ownerLevel: 'agency' | 'department' | 'workspace' | 'agent';
  ownerId: string;
  /** When true, this routine was auto-generated from HEARTBEAT.md */
  fromHeartbeat: boolean;
  status: RoutineStatus;
  /** ISO 8601 */
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failure' | 'skipped';
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinator Checkpoint
// ─────────────────────────────────────────────────────────────────────────────

export interface CoordinatorCheckpoint {
  id: string;
  sessionId: string;
  runId: string;
  decompositionSnapshot: TaskDecomposition;
  sessionSnapshot: ISession;
  /** JSON-serialised memory state */
  memorySnapshot: Record<string, unknown>;
  /** Subtask id at which execution was paused */
  pausedAtSubtaskId?: string;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// ICoordinatorAgent
// ─────────────────────────────────────────────────────────────────────────────

export interface ICoordinatorAgent {
  profile: IAgentProfile;

  /** Decompose a high-level goal into subtasks */
  decomposeGoal(goal: string, context?: Record<string, unknown>): Promise<TaskDecomposition>;

  /** Assign subtasks to specialised agents */
  assignSubtasks(decomposition: TaskDecomposition): Promise<void>;

  /** Re-plan a failed or stalled subtask */
  replan(
    decompositionId: string,
    failedSubtaskId: string,
    reason: string
  ): Promise<TaskDecomposition>;

  /** Consolidate outputs from all completed subtasks */
  consolidate(
    decomposition: TaskDecomposition,
    strategy: ConsolidationStrategy
  ): Promise<Record<string, unknown>>;

  /** Persist a checkpoint so execution can be resumed after restart */
  checkpoint(session: ISession): Promise<CoordinatorCheckpoint>;

  /** Resume from a stored checkpoint */
  resume(checkpointId: string): Promise<ISession>;

  /** Open or retrieve an active session */
  getOrCreateSession(workspaceId: string, initiatedBy: string): Promise<ISession>;
}
