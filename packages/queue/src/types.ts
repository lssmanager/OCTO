// packages/queue/src/types.ts
// Domain-specific job data types for all OCTO queues.
// These are the contracts between producers (control plane) and consumers (workers).
// All fields are readonly — jobs are immutable once enqueued.
//
// C1 fields (tenantId, idempotencyKey, triggerSource, attempt) have been added
// to ExecutionJobData to align with the executions table schema.
// These travel inside the OctoJobPayload.payload field.

import type { TriggerSource } from '@octo/contracts';

/** octo:health — F0 validation job */
export interface HealthJobData {
  readonly triggeredAt: string;  // ISO 8601
  readonly source: string;       // e.g. 'api-healthcheck', 'scheduler'
}

/** octo:execution — agent execution job */
export interface ExecutionJobData {
  readonly executionId:    string;   // UUID v7 — matches executions.id
  readonly agentId:        string;   // UUID v7 — matches agents.id
  readonly tenantId:       string;   // C1 field — mandatory
  readonly traceId:        string;   // W3C traceparent root
  readonly runId:          string;   // logical run grouping
  readonly triggerSource:  TriggerSource;  // C2 enum
  readonly attempt:        number;   // execution-level retry counter
  readonly idempotencyKey?: string;  // C1: TASK 5 dedup
  readonly task: Record<string, unknown>;  // TaskDefinition (typed in F1)
}

/** octo:delegation — hierarchical delegation job */
export interface DelegationJobData {
  readonly delegationId:  string;
  readonly fromAgentId:   string;
  readonly toAgentId:     string;
  readonly executionId:   string;
  readonly tenantId:      string;
  readonly traceId:       string;
  readonly runId:         string;
}

/** octo:tool — tool invocation job */
export interface ToolJobData {
  readonly invocationId:  string;
  readonly toolName:      string;
  readonly executionId:   string;
  readonly agentId:       string;
  readonly tenantId:      string;
  readonly traceId:       string;
  readonly runId:         string;
  readonly input: Record<string, unknown>;
}

/** octo:memory — memory operation job */
export interface MemoryJobData {
  readonly operationId:  string;
  readonly operation:    'store' | 'retrieve' | 'forget';
  readonly executionId:  string;
  readonly agentId:      string;
  readonly tenantId:     string;
  readonly traceId:      string;
  readonly runId:        string;
  readonly payload: Record<string, unknown>;
}

/** octo:channel — inbound channel message job */
export interface ChannelJobData {
  readonly messageId:    string;
  readonly channelType:  'discord' | 'telegram' | 'whatsapp' | 'slack' | 'http';
  readonly channelId:    string;
  readonly tenantId:     string;
  readonly traceId:      string;
  readonly content:      string;
  readonly metadata: Record<string, unknown>;
}
