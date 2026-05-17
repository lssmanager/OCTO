/**
 * Job data types for all OCTO queues.
 * These are the contracts between producers (control plane) and consumers (workers).
 * All fields are readonly — jobs are immutable once enqueued.
 */

/** octo:health — F0 validation job */
export interface HealthJobData {
  readonly triggeredAt: string; // ISO 8601
  readonly source: string; // e.g. 'api-healthcheck', 'scheduler'
}

/** octo:execution — F1+ agent execution job */
export interface ExecutionJobData {
  readonly executionId: string; // UUID v7 — matches executions.id in PostgreSQL
  readonly agentId: string; // UUID v7 — matches agents.id
  readonly traceId: string; // OTEL trace_id — propagated to runtime-worker
  readonly runId: string; // Logical run grouping
  readonly task: Record<string, unknown>; // TaskDefinition (typed in F1)
}

/** octo:delegation — F4+ hierarchical delegation job */
export interface DelegationJobData {
  readonly delegationId: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly executionId: string;
  readonly traceId: string;
}

/** octo:tool — F3+ tool invocation job */
export interface ToolJobData {
  readonly invocationId: string;
  readonly toolName: string;
  readonly executionId: string;
  readonly agentId: string;
  readonly traceId: string;
  readonly input: Record<string, unknown>;
}

/** octo:memory — F3+ memory operation job */
export interface MemoryJobData {
  readonly operationId: string;
  readonly operation: 'store' | 'retrieve' | 'forget';
  readonly executionId: string;
  readonly agentId: string;
  readonly traceId: string;
  readonly payload: Record<string, unknown>;
}
