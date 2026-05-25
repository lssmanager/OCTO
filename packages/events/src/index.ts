// packages/events/src/index.ts
// ADR: F0-015 (Observability), F0-006 (MCP/A2A)
//
// Este paquete expone:
//   1. IEventBus — interfaz del bus (implementación BullMQ/Redis en F1)
//   2. createEvent — builder que inyecta timestamp + version automáticamente
//   3. Payload types tipados por cada OctoEventType

import type {
  OctoEvent,
  OctoEventType,
  EventMetadata,
  GovernancePolicy,
  TaskResult,
  TokenUsage,
} from '@octo/contracts';

// ─── EVENT BUS INTERFACE ──────────────────────────────────────────────────────
// La implementación concreta (BullMQ + Redis) vive en packages/queue (F1).

export type { IEventBus };

interface IEventBus {
  publish<T = unknown>(event: OctoEvent<T>): Promise<void>;
  subscribe<T = unknown>(
    eventType: OctoEventType,
    handler: (event: OctoEvent<T>) => Promise<void>
  ): void;
  subscribeAll(handler: (event: OctoEvent) => Promise<void>): void;
}

// ─── EVENT BUILDER ────────────────────────────────────────────────────────────
// El caller omite timestamp y version — el builder los inyecta.
// Uso:
//   const ev = createEvent<ExecutionStartedPayload>(
//     'ExecutionStarted', payload, { traceId, runId, source: 'api' }
//   );

export function createEvent<T = unknown>(
  type: OctoEventType,
  payload: T,
  metadata: Omit<EventMetadata, 'timestamp' | 'version'>
): OctoEvent<T> {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}

// ─── PAYLOAD TYPES ────────────────────────────────────────────────────────────

export interface ExecutionStartedPayload {
  executionId: string;
  agentId: string;
  taskType: string;
  governance: GovernancePolicy;
}

export interface ExecutionCompletedPayload {
  executionId: string;
  agentId: string;
  durationMs: number;
  tokenUsage: TokenUsage;
  result: TaskResult;
}

export interface ExecutionFailedPayload {
  executionId: string;
  agentId: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  durationMs: number;
}

export interface DelegationCreatedPayload {
  parentExecutionId: string;
  childExecutionId: string;
  fromAgentId: string;
  toAgentId: string;
  /** Profundidad actual en la cadena (0 = primer nivel). */
  depth: number;
}

export interface DelegationCompletedPayload {
  parentExecutionId: string;
  childExecutionId: string;
  fromAgentId: string;
  toAgentId: string;
  durationMs: number;
  tokenUsage: TokenUsage;
}

export interface ToolInvokedPayload {
  toolName: string;
  executionId: string;
  agentId: string;
  input: Record<string, unknown>;
}

export interface ToolCompletedPayload {
  toolName: string;
  executionId: string;
  agentId: string;
  durationMs: number;
}

export interface ToolFailedPayload {
  toolName: string;
  executionId: string;
  agentId: string;
  errorCode: string;
  retryable: boolean;
}

export interface ApprovalRequestedPayload {
  executionId: string;
  agentId: string;
  trigger: string;
  context: Record<string, unknown>;
}

export interface GovernanceLimitReachedPayload {
  executionId: string;
  agentId: string;
  limitType: 'token_budget' | 'max_iterations' | 'max_delegation_depth' | 'timeout';
  limitValue: number;
  currentValue: number;
}

export interface MemoryStoredPayload {
  executionId: string;
  agentId: string;
  scope: string;
  keyCount: number;
}

export interface AgentSpawnedPayload {
  parentAgentId: string;
  childAgentId: string;
  executionId: string;
}

// Re-export contract types usados frecuentemente por consumers del bus
export type { OctoEvent, OctoEventType, EventMetadata } from '@octo/contracts';

export * from './outbox';

export * from './event-factory';
export * from './redis-stream-contract';
export * from './redis-stream-parser';
export * from './otel-event-context';
