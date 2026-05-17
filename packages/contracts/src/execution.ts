// packages/contracts/src/execution.ts
// ADR: F0-008 (CrewAI), F0-009 (Hermes), F0-010 (Paperclip)

// ─── GOVERNANCE POLICY ────────────────────────────────────────────────────────
// Value object que viaja en cada ExecutionRequest.
// Distinto de GovernancePolicy en policy.ts (entidad de config persistida).

export interface GovernancePolicy {
  /** Paperclip: hard token limit. Si se alcanza, la ejecución se detiene. */
  tokenBudget: number;
  /** CrewAI: max_iter. Límite de ciclos de razonamiento. */
  maxIterations: number;
  /** Hermes: profundidad máxima de cadena de delegación. */
  maxDelegationDepth: number;
  /** Whitelist de herramientas permitidas. Array vacío = ninguna. */
  allowedTools: string[];
  /** Si true, acciones críticas pausan para aprobación humana. */
  requireApproval: boolean;
  /** Timeout total de la ejecución en milisegundos. */
  timeoutMs: number;
}

// ─── TASK DEFINITION ─────────────────────────────────────────────────────────

export interface TaskDefinition {
  id: string;
  type: string;
  input: Record<string, unknown>;
  /** CrewAI: expected_output. Schema JSON del output esperado. */
  expectedOutputSchema?: Record<string, unknown>;
  /** Timeout específico de la tarea en ms (sobreescribe governance.timeoutMs). */
  timeout?: number;
}

// ─── EXECUTION CONTEXT ────────────────────────────────────────────────────────

export interface ExecutionContext {
  /** ID de la ejecución padre en una cadena de delegación. */
  parentExecutionId?: string;
  /** Hermes: cadena de IDs de agentes delegantes, de mayor a menor nivel. */
  delegationChain: string[];
  /** Scope de memoria para aislar estado entre ejecuciones. */
  memoryScope: string;
  /** Variables de entorno inyectadas en el contexto del agente. */
  variables: Record<string, unknown>;
}

// ─── EXECUTION REQUEST ────────────────────────────────────────────────────────
// Contrato principal: API → BullMQ queue → Python worker.

export interface ExecutionRequest {
  agentId: string;
  task: TaskDefinition;
  context?: ExecutionContext;
  /** OBLIGATORIO — Paperclip pattern: sin governance no hay ejecución. */
  governance: GovernancePolicy;
  /** OBLIGATORIO — propagado a todos los spans OTEL de esta request. */
  traceId: string;
}

// ─── EXECUTION RECORD ────────────────────────────────────────────────────────
// Persiste en DB. Distinto de ExecutionRequest (el record acumula resultado).

export interface Execution {
  id: string;
  agentId: string;
  status: ExecutionStatus;
  task: TaskDefinition;
  governance: GovernancePolicy;
  result?: TaskResult;
  error?: ExecutionError;
  traceId: string;
  /** Agrupa todas las ejecuciones de un mismo workflow. */
  runId: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  tokenUsage?: TokenUsage;
}

export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ─── TASK RESULT ─────────────────────────────────────────────────────────────

export interface TaskResult {
  output: unknown;
  outputType: string;
  confidence?: number;
  sources?: string[];
}

// ─── EXECUTION ERROR ─────────────────────────────────────────────────────────

export interface ExecutionError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// ─── TOKEN USAGE ─────────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

// ─── TASK (job unit para BullMQ) ─────────────────────────────────────────────

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

// ─── TOOL INVOCATION ─────────────────────────────────────────────────────────

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
