import { z } from 'zod';

import {
  BudgetStateSchema,
  ExecutionStatusSchema,
  ReplayExecutionModeSchema,
} from './execution';
import {
  IdSchema,
  IsoDatetimeSchema,
  JsonObjectSchema,
  NonEmptyStringSchema,
} from './shared';

export const WorkerRuntimeStateValues = [
  'ok',
  'degraded',
  'unknown',
  'error',
  'not_active',
] as const;
export const WorkerRuntimeStateSchema = z.enum(WorkerRuntimeStateValues);

export const TimelineEntryTypeValues = [
  'state',
  'step',
  'tool',
  'reclaim',
  'retry',
  'approval',
  'replay',
] as const;
export const TimelineEntryTypeSchema = z.enum(TimelineEntryTypeValues);

export const TimelineSeverityValues = ['info', 'warning', 'error'] as const;
export const TimelineSeveritySchema = z.enum(TimelineSeverityValues);

export const ToolInvocationStatusValues = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'timed_out',
  'blocked',
] as const;
export const ToolInvocationStatusSchema = z.enum(ToolInvocationStatusValues);

export const ToolSideEffectLevelValues = ['none', 'low', 'high'] as const;
export const ToolSideEffectLevelSchema = z.enum(ToolSideEffectLevelValues);

export const RuntimeProjectionDeltaTypeValues = [
  'execution.runtime.updated',
  'execution.timeline.appended',
  'execution.tool.updated',
  'worker.runtime.updated',
  'queue.runtime.updated',
  'execution.cost.updated',
  'outbox.runtime.updated',
] as const;
export const RuntimeProjectionDeltaTypeSchema = z.enum(RuntimeProjectionDeltaTypeValues);

export const ExecutionRuntimeProjectionSchema = z.object({
  executionId: IdSchema,
  tenantId: IdSchema,
  status: ExecutionStatusSchema,
  currentStepIndex: z.number().int().nonnegative().nullable(),
  retryCount: z.number().int().nonnegative(),
  reclaimCount: z.number().int().nonnegative(),
  dispatchedAt: IsoDatetimeSchema.nullable(),
  startedAt: IsoDatetimeSchema.nullable(),
  finishedAt: IsoDatetimeSchema.nullable(),
  lastHeartbeatAt: IsoDatetimeSchema.nullable(),
  replayOfExecutionId: IdSchema.nullable(),
  replayFromCheckpointId: IdSchema.nullable(),
  replayMode: ReplayExecutionModeSchema.nullable(),
  updatedAt: IsoDatetimeSchema,
}).strict();

export const ExecutionTimelineEntrySchema = z.object({
  id: IdSchema,
  executionId: IdSchema,
  timelineIndex: z.number().int().nonnegative(),
  entryType: TimelineEntryTypeSchema,
  stepIndex: z.number().int().nonnegative().nullable(),
  severity: TimelineSeveritySchema,
  title: NonEmptyStringSchema,
  summary: z.string().nullable(),
  source: NonEmptyStringSchema,
  payload: JsonObjectSchema,
  createdAt: IsoDatetimeSchema,
}).strict();

export const ToolInvocationProjectionSchema = z.object({
  toolInvocationId: IdSchema,
  executionId: IdSchema,
  stepIndex: z.number().int().nonnegative().nullable(),
  toolName: NonEmptyStringSchema,
  status: ToolInvocationStatusSchema,
  sideEffectLevel: ToolSideEffectLevelSchema,
  requiresApproval: z.boolean(),
  durationMs: z.number().int().nonnegative().nullable(),
  validatedInput: JsonObjectSchema.nullable(),
  validatedOutput: JsonObjectSchema.nullable(),
  error: JsonObjectSchema.nullable(),
  updatedAt: IsoDatetimeSchema,
}).strict();

export const WorkerRuntimeProjectionSchema = z.object({
  workerType: NonEmptyStringSchema,
  instanceId: IdSchema,
  state: WorkerRuntimeStateSchema,
  startedAt: IsoDatetimeSchema.nullable(),
  lastHeartbeatAt: IsoDatetimeSchema.nullable(),
  version: z.string().nullable(),
  commitSha: z.string().nullable(),
  diagnostics: JsonObjectSchema.nullable(),
  updatedAt: IsoDatetimeSchema,
}).strict();

export const QueueRuntimeProjectionSchema = z.object({
  queueName: NonEmptyStringSchema,
  backlog: z.number().int().nonnegative(),
  inflight: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  failedRecent: z.number().int().nonnegative(),
  dlqCount: z.number().int().nonnegative(),
  oldestJobAgeMs: z.number().int().nonnegative().nullable(),
  updatedAt: IsoDatetimeSchema,
}).strict();

export const ExecutionCostProjectionSchema = z.object({
  executionId: IdSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.string().regex(/^-?\d+(\.\d+)?$/),
  budgetState: BudgetStateSchema,
  updatedAt: IsoDatetimeSchema,
}).strict();

export const OutboxRuntimeProjectionSchema = z.object({
  streamName: NonEmptyStringSchema,
  unpublishedCount: z.number().int().nonnegative(),
  publishLagMs: z.number().int().nonnegative().nullable(),
  lastFailedEventType: z.string().nullable(),
  dlqCount: z.number().int().nonnegative(),
  updatedAt: IsoDatetimeSchema,
}).strict();

export const RuntimeOverviewSchema = z.object({
  active: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  retrying: z.number().int().nonnegative(),
  reclaiming: z.number().int().nonnegative(),
  failedRecent: z.number().int().nonnegative(),
  dlqCount: z.number().int().nonnegative(),
  updatedAt: IsoDatetimeSchema,
}).strict();

export const ExecutionRuntimeDetailSchema = z.object({
  execution: ExecutionRuntimeProjectionSchema,
  cost: ExecutionCostProjectionSchema.nullable(),
  workers: z.array(WorkerRuntimeProjectionSchema),
  queues: z.array(QueueRuntimeProjectionSchema),
}).strict();

export const PaginatedExecutionRuntimeProjectionSchema = z.object({
  items: z.array(ExecutionRuntimeProjectionSchema),
  nextCursor: z.string().nullable(),
}).strict();

export const ExecutionTimelineResponseSchema = z.object({
  items: z.array(ExecutionTimelineEntrySchema),
}).strict();

export const ExecutionToolInvocationsResponseSchema = z.object({
  items: z.array(ToolInvocationProjectionSchema),
}).strict();

export const QueueRuntimeProjectionListSchema = z.object({
  items: z.array(QueueRuntimeProjectionSchema),
}).strict();

export const WorkerRuntimeProjectionListSchema = z.object({
  items: z.array(WorkerRuntimeProjectionSchema),
}).strict();

export const OutboxRuntimeProjectionListSchema = z.object({
  items: z.array(OutboxRuntimeProjectionSchema),
}).strict();

export const ExecutionRuntimeUpdatedDeltaSchema = z.object({
  type: z.literal('execution.runtime.updated'),
  tenantId: IdSchema,
  traceId: IdSchema,
  occurredAt: IsoDatetimeSchema,
  payload: ExecutionRuntimeProjectionSchema,
}).strict();

export const ExecutionTimelineAppendedDeltaSchema = z.object({
  type: z.literal('execution.timeline.appended'),
  tenantId: IdSchema,
  traceId: IdSchema,
  occurredAt: IsoDatetimeSchema,
  payload: ExecutionTimelineEntrySchema,
}).strict();

export const ExecutionToolUpdatedDeltaSchema = z.object({
  type: z.literal('execution.tool.updated'),
  tenantId: IdSchema,
  traceId: IdSchema,
  occurredAt: IsoDatetimeSchema,
  payload: ToolInvocationProjectionSchema,
}).strict();

export const WorkerRuntimeUpdatedDeltaSchema = z.object({
  type: z.literal('worker.runtime.updated'),
  tenantId: IdSchema,
  traceId: IdSchema,
  occurredAt: IsoDatetimeSchema,
  payload: WorkerRuntimeProjectionSchema,
}).strict();

export const QueueRuntimeUpdatedDeltaSchema = z.object({
  type: z.literal('queue.runtime.updated'),
  tenantId: IdSchema,
  traceId: IdSchema,
  occurredAt: IsoDatetimeSchema,
  payload: QueueRuntimeProjectionSchema,
}).strict();

export const ExecutionCostUpdatedDeltaSchema = z.object({
  type: z.literal('execution.cost.updated'),
  tenantId: IdSchema,
  traceId: IdSchema,
  occurredAt: IsoDatetimeSchema,
  payload: ExecutionCostProjectionSchema,
}).strict();

export const OutboxRuntimeUpdatedDeltaSchema = z.object({
  type: z.literal('outbox.runtime.updated'),
  tenantId: IdSchema,
  traceId: IdSchema,
  occurredAt: IsoDatetimeSchema,
  payload: OutboxRuntimeProjectionSchema,
}).strict();

export const RuntimeProjectionDeltaEnvelopeSchema = z.discriminatedUnion('type', [
  ExecutionRuntimeUpdatedDeltaSchema,
  ExecutionTimelineAppendedDeltaSchema,
  ExecutionToolUpdatedDeltaSchema,
  WorkerRuntimeUpdatedDeltaSchema,
  QueueRuntimeUpdatedDeltaSchema,
  ExecutionCostUpdatedDeltaSchema,
  OutboxRuntimeUpdatedDeltaSchema,
]);

export type WorkerRuntimeState = z.infer<typeof WorkerRuntimeStateSchema>;
export type TimelineEntryType = z.infer<typeof TimelineEntryTypeSchema>;
export type TimelineSeverity = z.infer<typeof TimelineSeveritySchema>;
export type ToolInvocationStatus = z.infer<typeof ToolInvocationStatusSchema>;
export type ToolSideEffectLevel = z.infer<typeof ToolSideEffectLevelSchema>;
export type ExecutionRuntimeProjection = z.infer<typeof ExecutionRuntimeProjectionSchema>;
export type ExecutionTimelineEntry = z.infer<typeof ExecutionTimelineEntrySchema>;
export type ToolInvocationProjection = z.infer<typeof ToolInvocationProjectionSchema>;
export type WorkerRuntimeProjection = z.infer<typeof WorkerRuntimeProjectionSchema>;
export type QueueRuntimeProjection = z.infer<typeof QueueRuntimeProjectionSchema>;
export type ExecutionCostProjection = z.infer<typeof ExecutionCostProjectionSchema>;
export type OutboxRuntimeProjection = z.infer<typeof OutboxRuntimeProjectionSchema>;
export type RuntimeOverview = z.infer<typeof RuntimeOverviewSchema>;
export type ExecutionRuntimeDetail = z.infer<typeof ExecutionRuntimeDetailSchema>;
export type PaginatedExecutionRuntimeProjection = z.infer<typeof PaginatedExecutionRuntimeProjectionSchema>;
export type ExecutionTimelineResponse = z.infer<typeof ExecutionTimelineResponseSchema>;
export type ExecutionToolInvocationsResponse = z.infer<typeof ExecutionToolInvocationsResponseSchema>;
export type QueueRuntimeProjectionList = z.infer<typeof QueueRuntimeProjectionListSchema>;
export type WorkerRuntimeProjectionList = z.infer<typeof WorkerRuntimeProjectionListSchema>;
export type OutboxRuntimeProjectionList = z.infer<typeof OutboxRuntimeProjectionListSchema>;
export type RuntimeProjectionDeltaEnvelope = z.infer<typeof RuntimeProjectionDeltaEnvelopeSchema>;
