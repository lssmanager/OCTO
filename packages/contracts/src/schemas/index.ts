// packages/contracts/src/schemas/index.ts
// Fix 5 — Option A: JSON Schema source-of-truth for cross-language contract parity.
//
// Strategy: define job payload schemas with zod, export both the TypeScript
// type (inferred) AND the JSON Schema (for Python codegen).
// The generated contracts.py is committed so Python workers never need
// a build step — they just import from it.

import { z } from 'zod';

// ─── EXECUTION JOB ───────────────────────────────────────────────────────────

export const ExecutionJobDataSchema = z.object({
  executionId: z.string().uuid().describe('UUID v7 — matches executions.id'),
  agentId:     z.string().uuid().describe('UUID v7 — matches agents.id'),
  tenantId:    z.string().uuid().describe('UUID v7 — tenant/workspace scope'),
  traceId:     z.string().describe('OTEL trace_id hex (32 chars)'),
  spanId:      z.string().describe('OTEL span_id hex (16 chars) of the enqueue span'),
  runId:       z.string().uuid().describe('Logical run grouping'),
  attempt:     z.number().int().min(0).default(0).describe('Current retry attempt number'),
  createdAt:   z.string().datetime().describe('ISO 8601 timestamp of job creation'),
  source:      z.string().describe('Service that created this job (e.g. api, scheduler-worker)'),
  traceparent: z.string().optional().describe('W3C traceparent — injected by instrumented-queue'),
  task: z.object({
    id:     z.string(),
    type:   z.string(),
    input:  z.record(z.unknown()),
    expectedOutputSchema: z.record(z.unknown()).optional(),
    timeout: z.number().int().positive().optional(),
  }),
  governance: z.object({
    tokenBudget:        z.number().int().positive(),
    maxIterations:      z.number().int().positive(),
    maxDelegationDepth: z.number().int().min(0),
    allowedTools:       z.array(z.string()),
    requireApproval:    z.boolean(),
    timeoutMs:          z.number().int().positive(),
  }),
});

export type ExecutionJobDataV = z.infer<typeof ExecutionJobDataSchema>;

// ─── DELEGATION JOB ──────────────────────────────────────────────────────────

export const DelegationJobDataSchema = z.object({
  delegationId:  z.string().uuid(),
  fromAgentId:   z.string().uuid(),
  toAgentId:     z.string().uuid(),
  executionId:   z.string().uuid(),
  traceId:       z.string(),
  traceparent:   z.string().optional(),
});

export type DelegationJobDataV = z.infer<typeof DelegationJobDataSchema>;

// ─── TOOL JOB ────────────────────────────────────────────────────────────────

export const ToolJobDataSchema = z.object({
  invocationId: z.string().uuid(),
  toolName:     z.string().min(1),
  executionId:  z.string().uuid(),
  agentId:      z.string().uuid(),
  traceId:      z.string(),
  traceparent:  z.string().optional(),
  input:        z.record(z.unknown()),
});

export type ToolJobDataV = z.infer<typeof ToolJobDataSchema>;

// ─── MEMORY JOB ──────────────────────────────────────────────────────────────

export const MemoryJobDataSchema = z.object({
  operationId: z.string().uuid(),
  operation:   z.enum(['store', 'retrieve', 'forget']),
  executionId: z.string().uuid(),
  agentId:     z.string().uuid(),
  traceId:     z.string(),
  traceparent: z.string().optional(),
  payload:     z.record(z.unknown()),
});

export type MemoryJobDataV = z.infer<typeof MemoryJobDataSchema>;

// ─── HEALTH JOB ──────────────────────────────────────────────────────────────

export const HealthJobDataSchema = z.object({
  triggeredAt: z.string().datetime(),
  source:      z.string(),
});

export type HealthJobDataV = z.infer<typeof HealthJobDataSchema>;

// ─── REGISTRY (used by codegen script) ───────────────────────────────────────

export const JOB_SCHEMAS = {
  ExecutionJobData:  ExecutionJobDataSchema,
  DelegationJobData: DelegationJobDataSchema,
  ToolJobData:       ToolJobDataSchema,
  MemoryJobData:     MemoryJobDataSchema,
  HealthJobData:     HealthJobDataSchema,
} as const;

export type JobSchemaName = keyof typeof JOB_SCHEMAS;
