// packages/contracts/src/events.ts
// ADR: F0-015 (Observability), F0-006 (MCP/A2A)
//
// CRIT-3: Mandatory OctoEvent<T> envelope for all queue jobs and system events.
// Every event crossing a worker boundary MUST carry the full correlation context.
// This is the enforcement point for distributed trace continuity.

import { randomUUID } from 'crypto';

// ─── EVENT TYPES ─────────────────────────────────────────────────────────────

export type OctoEventType =
  // Execution lifecycle
  | 'ExecutionStarted'
  | 'ExecutionCompleted'
  | 'ExecutionFailed'
  | 'ExecutionPaused'
  | 'ExecutionResumed'
  | 'ExecutionCancelled'
  | 'ExecutionStepStarted'
  | 'ExecutionStepCompleted'
  | 'ExecutionStepFailed'
  | 'ExecutionCheckpointCreated'
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
  | 'AgentTerminated'
  // Governance (Paperclip pattern)
  | 'GovernanceLimitReached'
  | 'BudgetExceeded'
  // System
  | 'CheckpointCreated'
  | 'WorkerHealthChanged';

// ─── EVENT METADATA ───────────────────────────────────────────────────────────
// All fields mandatory except executionId/agentId
// (some events are system-level, not bound to a specific execution).

export interface EventMetadata {
  /** W3C traceparent — propagated from the originating request. Connects OTel spans. */
  traceId: string;
  /** ID of the specific execution. Optional for system-level events. */
  executionId?: string;
  /** ID of the emitting agent. Optional for system-level events. */
  agentId?: string;
  /** Groups all events belonging to the same multi-step workflow. */
  runId: string;
  /**
   * Tenant/organization scope. Mandatory from day one.
   * Retrofitting multi-tenancy after data exists is catastrophically expensive.
   */
  tenantId: string;
  /** ISO 8601 — auto-injected by createEvent(). */
  timestamp: string;
  /** Schema version — enables contract migration in F2+. */
  version: '1.0';
  /** Service that emitted this event (e.g. 'api', 'runtime-worker', 'scheduler-worker'). */
  source: string;
}

// ─── OCTO EVENT ───────────────────────────────────────────────────────────────

export interface OctoEvent<T = unknown> {
  /** UUID v7 (time-ordered) — enables time-range queries without an extra index. */
  id: string;
  type: OctoEventType;
  payload: T;
  metadata: EventMetadata;
}

// ─── EVENT FACTORY ────────────────────────────────────────────────────────────
// Use this instead of constructing OctoEvent objects manually.
// Guarantees id and timestamp are always set correctly.

export function createEvent<T>(
  type: OctoEventType,
  payload: T,
  metadata: Omit<EventMetadata, 'timestamp' | 'version'>,
): OctoEvent<T> {
  return {
    id: randomUUID(),
    type,
    payload,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}

// ─── OTEL CONTEXT PROPAGATION ─────────────────────────────────────────────────
// OTel context does NOT cross process boundaries through Redis automatically.
// It must be manually serialized into the queue job payload and deserialized
// on the worker side to maintain distributed trace continuity.
//
// Usage (producer — control plane / API):
//   import { injectOtelContext, createEvent } from '@octo/contracts';
//   const job = await queue.add('execute', {
//     event: createEvent('ExecutionStarted', payload, meta),
//     _otel: injectOtelContext(),
//   });
//
// Usage (consumer — any worker):
//   import { extractOtelContext } from '@octo/contracts';
//   import { context } from '@opentelemetry/api';
//   const parentCtx = extractOtelContext(job.data._otel ?? {});
//   await context.with(parentCtx, () => processJob(job));

export type OtelCarrier = Record<string, string>;

/**
 * Serializes the active OTel context into a plain carrier object
 * suitable for storage in a BullMQ job payload.
 *
 * Call this on the producer side, immediately before enqueuing.
 * Degrades safely if @opentelemetry/api is not present in the caller.
 */
export function injectOtelContext(): OtelCarrier {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { context, propagation } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
    const carrier: OtelCarrier = {};
    propagation.inject(context.active(), carrier);
    return carrier;
  } catch {
    return {};
  }
}

/**
 * Deserializes OTel context from a carrier object stored in a job payload.
 * Returns the restored Context. Pass to context.with() in the worker.
 * Degrades safely if @opentelemetry/api is not present in the caller.
 */
export function extractOtelContext(carrier: OtelCarrier): import('@opentelemetry/api').Context {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { context, propagation } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
    return propagation.extract(context.active(), carrier);
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { context } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
    return context.active();
  }
}

// ─── TYPED JOB PAYLOAD ────────────────────────────────────────────────────────
// Wrapper for BullMQ job data. Every job in OCTO must use this type.
// Ensures the OTel carrier and event envelope always travel together.

export interface OctoJobPayload<T = unknown> {
  event: OctoEvent<T>;
  /** Serialized OTel W3C traceparent. Populated by injectOtelContext(). */
  _otel: OtelCarrier;
}

// ─── EVENT PAYLOAD INTERFACES ────────────────────────────────────────────────
// Strongly typed payloads for each core event type.
// Extend as new event types are added to OctoEventType.

export interface ExecutionStartedPayload {
  agentId: string;
  tenantId: string;
  input: unknown;
  triggerSource: 'api' | 'schedule' | 'channel' | 'delegation';
}

export interface ExecutionStepStartedPayload {
  runId: string;
  stepType: 'llm_call' | 'tool_invocation' | 'delegation' | 'memory_retrieval' | 'checkpoint';
  stepInput: unknown;
}

export interface ExecutionStepCompletedPayload {
  runId: string;
  stepId: string;
  stepType: string;
  stepOutput: unknown;
  durationMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export interface ExecutionStepFailedPayload {
  runId: string;
  stepId: string;
  stepType: string;
  error: { message: string; code?: string; stack?: string };
  retryCount: number;
}

export interface ExecutionCompletedPayload {
  output: unknown;
  durationMs: number;
  totalTokens?: number;
  totalCostUsd?: number;
}

export interface ExecutionFailedPayload {
  error: { message: string; code?: string };
  failedAtStep?: string;
}

export interface DelegationCreatedPayload {
  fromAgentId: string;
  toAgentId: string;
  task: unknown;
  delegationDepth: number;
}

export interface ToolInvokedPayload {
  toolName: string;
  toolInput: unknown;
  mcpServerId?: string;
}

export interface ToolCompletedPayload {
  toolName: string;
  toolOutput: unknown;
  durationMs: number;
}

export interface ApprovalRequestedPayload {
  approvalId: string;
  requestedBy: string;
  context: unknown;
  timeoutMs: number;
}

export interface AgentSpawnedPayload {
  parentAgentId?: string;
  childAgentId: string;
  capability: string;
  spawnReason: string;
}

export interface GovernanceLimitReachedPayload {
  limitType:
    | 'recursion_depth'
    | 'delegation_cap'
    | 'token_budget'
    | 'execution_budget'
    | 'tool_permission';
  limitValue: number;
  currentValue: number;
  agentId: string;
}
