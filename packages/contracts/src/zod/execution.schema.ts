import { z } from 'zod';
import { ExecutionStatusValues } from '../execution';

export const ExecutionStateSchema = z.enum(
  ExecutionStatusValues as [
    (typeof ExecutionStatusValues)[number],
    ...(typeof ExecutionStatusValues)[number][],
  ]
);

export const ExecutionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  agentId: z.string(),
  agentVersionId: z.string(),
  state: ExecutionStateSchema,
  version: z.number().int(),
  inputJson: z.object({}).catchall(z.unknown()),
  outputJson: z.object({}).catchall(z.unknown()).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  attemptCount: z.number().int(),
  reclaimCount: z.number().int(),
  leaseOwner: z.string().nullable().optional(),
  leaseExpiresAt: z.string().datetime().nullable().optional(),
  cancellationRequestedAt: z.string().datetime().nullable().optional(),
  budgetSnapshotJson: z.object({}).catchall(z.unknown()).nullable().optional(),
  contextSnapshotJson: z.object({}).catchall(z.unknown()).nullable().optional(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ExecutionStepStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'SKIPPED',
]);

export const ExecutionStepSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  executionId: z.string(),
  stepIndex: z.number().int(),
  stepType: z.string(),
  stateFrom: z.string().nullable().optional(),
  stateTo: z.string().nullable().optional(),
  status: ExecutionStepStatusSchema,
  inputJson: z.object({}).catchall(z.unknown()).nullable().optional(),
  outputJson: z.object({}).catchall(z.unknown()).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
});

export type ExecutionState = z.infer<typeof ExecutionStateSchema>;
export type Execution = z.infer<typeof ExecutionSchema>;
export type ExecutionStepStatus = z.infer<typeof ExecutionStepStatusSchema>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
