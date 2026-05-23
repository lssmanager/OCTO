import { z } from 'zod';

export const OutboxAggregateTypeSchema = z.enum(['execution', 'agent', 'tool_invocation', 'approval']);

export const OutboxEventTypeSchema = z.enum([
  'ExecutionQueued','ExecutionDispatched','ExecutionStarted','ExecutionStepCompleted','ExecutionCheckpointed','ExecutionPaused','ExecutionResumed','ExecutionSucceeded','ExecutionFailed','ExecutionCancelled','ExecutionReclaiming','ExecutionReclaimed','CheckpointCreated','ToolInvoked','ToolInvocationStarted','ToolInvocationCompleted','ToolCompleted','ToolFailed','ApprovalRequested','ApprovalResolved',
]);

export const OutboxEventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  aggregateType: OutboxAggregateTypeSchema,
  aggregateId: z.string(),
  eventType: OutboxEventTypeSchema,
  sequence: z.number().int(),
  payloadJson: z.record(z.unknown()),
  publishedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type OutboxAggregateType = z.infer<typeof OutboxAggregateTypeSchema>;
export type OutboxEventType = z.infer<typeof OutboxEventTypeSchema>;
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;
