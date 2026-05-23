import { z } from 'zod';

export const ExecutionStateSchema = z.enum([
  'QUEUED',
  'DISPATCHED',
  'RUNNING',
  'PAUSED',
  'RETRY_SCHEDULED',
  'RECLAIMING',
  'TIMED_OUT',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'DLQ',
]);

export const ExecutionStepStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'SKIPPED',
]);

const JsonRecordSchema = z.record(z.unknown());
const IsoDatetimeSchema = z.string().datetime();

export const ExecutionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  agentId: z.string(),
  agentVersionId: z.string(),
  state: ExecutionStateSchema,
  version: z.number().int(),
  inputJson: JsonRecordSchema,
  outputJson: JsonRecordSchema.nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  attemptCount: z.number().int(),
  reclaimCount: z.number().int(),
  leaseOwner: z.string().nullable().optional(),
  leaseExpiresAt: IsoDatetimeSchema.nullable().optional(),
  cancellationRequestedAt: IsoDatetimeSchema.nullable().optional(),
  budgetSnapshotJson: JsonRecordSchema.nullable().optional(),
  contextSnapshotJson: JsonRecordSchema.nullable().optional(),
  createdBy: z.string(),
  createdAt: IsoDatetimeSchema,
  updatedAt: IsoDatetimeSchema,
});

export const ExecutionStepSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  executionId: z.string(),
  stepIndex: z.number().int(),
  stepType: z.string(),
  stateFrom: z.string().nullable().optional(),
  stateTo: z.string().nullable().optional(),
  status: ExecutionStepStatusSchema,
  inputJson: JsonRecordSchema.nullable().optional(),
  outputJson: JsonRecordSchema.nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: IsoDatetimeSchema,
  endedAt: IsoDatetimeSchema.nullable().optional(),
});

export type ExecutionState = z.infer<typeof ExecutionStateSchema>;
export type Execution = z.infer<typeof ExecutionSchema>;
export type ExecutionStepStatus = z.infer<typeof ExecutionStepStatusSchema>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
