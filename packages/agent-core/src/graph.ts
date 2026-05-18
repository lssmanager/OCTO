/**
 * graph.ts — DAG-based execution graph types for @octo/agent-core.
 *
 * Architectural invariant (ABSOLUTE PRINCIPLE 4):
 *   Execution is DAG-based, stateful, resumable, replayable, dependency-aware.
 *   The visual editor NEVER controls execution directly.
 *   The runtime executes IMMUTABLE execution graphs.
 *
 * Architectural invariant (ABSOLUTE PRINCIPLE 13):
 *   Executions must survive container restarts via CheckpointStore.
 *   ExecutionGraphCheckpoint is the serialisable state blob saved to Redis.
 *
 * FORBIDDEN imports in this file:
 *   ✗ bullmq, ioredis, @nestjs/*, drizzle-orm, postgres
 *   ✗ @octo/queue, @octo/database, apps/api, apps/runtime-worker
 *   ✔ @octo/contracts (type imports only)
 */
import type { AgentNode, DelegationEdge } from '@octo/contracts';

// ----------------------------------------------------------- status literals

export type ExecutionGraphStatus =
  | 'building'
  | 'ready'
  | 'executing'
  | 'paused'
  | 'awaiting_approval'
  | 'completed'
  | 'failed';

export type ExecutionGraphNodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'paused';

// -------------------------------------------------------------- policy types

/**
 * ExecutionGraphPolicy — governance constraints attached to an ExecutionGraph.
 * Mirrors GovernancePolicy from @octo/contracts but scoped to the graph level.
 * Control Plane validates this before allowing graph execution.
 */
export interface ExecutionGraphPolicy {
  tokenBudget: number;
  maxIterations: number;
  maxRecursionDepth: number;
  allowedTools: string[];
  requireApproval: boolean;
  timeoutMs: number;
}

// ------------------------------------------------------------- checkpoint

/**
 * ExecutionGraphCheckpoint — serialisable state blob for pause/resume.
 * Persisted to Redis by CheckpointStore (Principle 13).
 * Loaded by ExecutionEngine before dispatch to resume from last step.
 */
export interface ExecutionGraphCheckpoint {
  graphId: string;
  executionId: string;
  /** Index of the last successfully completed node. */
  lastCompletedNodeIndex: number;
  /** Partial outputs keyed by node id. */
  nodeOutputs: Record<string, unknown>;
  /** ISO 8601 timestamp of the last checkpoint write. */
  savedAt: string;
  /** Attempt number when this checkpoint was created. */
  attempt: number;
}

// --------------------------------------------------------------- graph types

export interface ExecutionGraph {
  id: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
  rootNodeId: string;
  status: ExecutionGraphStatus;
  policy: ExecutionGraphPolicy;
  /** Present after the first checkpoint save (Principle 13). */
  checkpoint?: ExecutionGraphCheckpoint;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionGraphNode {
  id: string;
  agentNode: AgentNode;
  taskIds: string[];
  status: ExecutionGraphNodeStatus;
  /** Node ids that must complete before this node can run. */
  dependsOn: string[];
  /** Token usage accumulated by this node. */
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export interface ExecutionGraphEdge {
  id: string;
  from: string;
  to: string;
  delegationEdge?: DelegationEdge;
  /** Optional CEL/JSONLogic expression evaluated at runtime. */
  condition?: string;
}
