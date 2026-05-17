// Execution primitive contracts

export interface Execution {
  id: string;
  runId: string;
  agentId: string;
  status: ExecutionStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  traceId: string;
  startedAt: Date;
  completedAt?: Date;
  checkpointAt?: Date;
}

export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retrying';

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

export type TaskType =
  | 'llm_call'
  | 'tool_invocation'
  | 'memory_read'
  | 'memory_write'
  | 'delegation'
  | 'approval'
  | 'planning';

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
