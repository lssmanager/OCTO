// packages/contracts/src/events.ts
// ADR: F0-015 (Observability), F0-006 (MCP/A2A)

// ─── EVENT TYPES ─────────────────────────────────────────────────────────────

export type OctoEventType =
  // Execution lifecycle
  | 'ExecutionStarted'
  | 'ExecutionCompleted'
  | 'ExecutionFailed'
  | 'ExecutionPaused'
  | 'ExecutionResumed'
  | 'ExecutionCancelled'
  // Delegation (Hermes pattern)
  | 'DelegationCreated'
  | 'DelegationCompleted'
  // Tools (MCP pattern)
  | 'ToolInvoked'
  | 'ToolCompleted'
  | 'ToolFailed'
  // Human-in-the-loop
  | 'ApprovalRequested'
  | 'ApprovalGranted'
  | 'ApprovalRejected'
  // Memory
  | 'MemoryRetrieved'
  | 'MemoryStored'
  // Agents
  | 'AgentSpawned'
  // Governance (Paperclip pattern)
  | 'GovernanceLimitReached'
  // System
  | 'CheckpointCreated'
  | 'BudgetExceeded';

// ─── EVENT METADATA ───────────────────────────────────────────────────────────
// Todos los campos son obligatorios salvo executionId/agentId
// (algunos eventos son de sistema, sin ejecución específica).

export interface EventMetadata {
  /** Propagado desde la request original. Conecta con spans OTEL. */
  traceId: string;
  /** ID de la ejecución específica. Opcional para eventos de sistema. */
  executionId?: string;
  /** ID del agente emisor. Opcional para eventos de sistema. */
  agentId?: string;
  /** Agrupa todos los eventos de un mismo workflow multi-paso. */
  runId: string;
  /** ISO 8601 — el builder `createEvent` lo inyecta automáticamente. */
  timestamp: string;
  /** Schema version — permite migración de contratos en F2+. */
  version: '1.0';
  /** Nombre del servicio que emitió el evento (e.g. 'api', 'runtime-worker'). */
  source: string;
}

// ─── OCTO EVENT ───────────────────────────────────────────────────────────────

export interface OctoEvent<T = unknown> {
  /** UUID v7 (time-ordered) — permite queries por rango de tiempo sin índice extra. */
  id: string;
  type: OctoEventType;
  payload: T;
  metadata: EventMetadata;
}
