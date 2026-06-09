import { z } from 'zod';

import {
  ExecutionStatusSchema,
  ReplayExecutionModeSchema,
} from './execution';
import { IdSchema, IsoDatetimeSchema, NonEmptyStringSchema } from './shared';

export const ReplayExecutionRequestSchema = z.object({
  checkpointId: IdSchema.optional(),
  mode: ReplayExecutionModeSchema,
  reason: NonEmptyStringSchema,
  forceRetriggerSideEffects: z.boolean().default(false).optional(),
}).strict();

export const ReplayExecutionAcceptedSchema = z.object({
  executionId: IdSchema,
  sourceExecutionId: IdSchema,
  checkpointId: IdSchema,
  mode: ReplayExecutionModeSchema,
  status: ExecutionStatusSchema,
}).strict();

export const ExecutionCheckpointSummarySchema = z.object({
  checkpointId: IdSchema,
  stepIndex: z.number().int().nonnegative(),
  source: NonEmptyStringSchema,
  createdAt: IsoDatetimeSchema,
  replayEligible: z.boolean(),
}).strict();

export const LinkedReplayExecutionSchema = z.object({
  executionId: IdSchema,
  sourceExecutionId: IdSchema,
  checkpointId: IdSchema.nullable(),
  mode: ReplayExecutionModeSchema,
  status: ExecutionStatusSchema,
  startedAt: IsoDatetimeSchema.nullable(),
  finishedAt: IsoDatetimeSchema.nullable(),
  updatedAt: IsoDatetimeSchema,
}).strict();

export const ExecutionCheckpointsResponseSchema = z.object({
  items: z.array(ExecutionCheckpointSummarySchema),
}).strict();

export const ExecutionReplaysResponseSchema = z.object({
  items: z.array(LinkedReplayExecutionSchema),
}).strict();

export type ReplayExecutionRequest = z.infer<typeof ReplayExecutionRequestSchema>;
export type ReplayExecutionAccepted = z.infer<typeof ReplayExecutionAcceptedSchema>;
export type ExecutionCheckpointSummary = z.infer<typeof ExecutionCheckpointSummarySchema>;
export type LinkedReplayExecution = z.infer<typeof LinkedReplayExecutionSchema>;
export type ExecutionCheckpointsResponse = z.infer<typeof ExecutionCheckpointsResponseSchema>;
export type ExecutionReplaysResponse = z.infer<typeof ExecutionReplaysResponseSchema>;
