import { z } from 'zod';

export const OutboxAggregateTypeSchema = z.enum(['execution', 'agent', 'tool_invocation', 'approval']);

export const OutboxEventTypeSchema = z.enum([
  'ExecutionQueued','ExecutionDispatched','ExecutionStarted','ExecutionStepCompleted','ExecutionPaused','ExecutionResumed','ExecutionReclaiming','ExecutionReclaimed','ExecutionRetryScheduled','ExecutionSucceeded','ExecutionFailed','ExecutionCancelled','ExecutionTimedOut','ExecutionDLQ',
  'ToolInvocationStarted','ToolInvocationSucceeded','ToolInvocationFailed','ToolInvocationTimedOut','ToolApprovalRequested',
  'LLMCallStarted','LLMCallCompleted','LLMCallFailed','LLMBudgetExceeded',
  'ApprovalRequested','ApprovalGranted','ApprovalDenied','ApprovalExpired',
]);

export const OutboxEventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  aggregateType: OutboxAggregateTypeSchema,
  aggregateId: z.string(),
  eventType: OutboxEventTypeSchema,
  sequence: z.number().int(),
  payloadJson: z.record(z.string(), z.unknown()),
  publishedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type OutboxAggregateType = z.infer<typeof OutboxAggregateTypeSchema>;
export type OutboxEventType = z.infer<typeof OutboxEventTypeSchema>;
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;
