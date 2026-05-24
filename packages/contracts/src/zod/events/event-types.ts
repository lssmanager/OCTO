import { z } from 'zod';

export const ExecutionEventTypeSchema = z.enum([
  'ExecutionQueued','ExecutionDispatched','ExecutionStarted','ExecutionStepCompleted','ExecutionPaused','ExecutionResumed','ExecutionReclaiming','ExecutionReclaimed','ExecutionRetryScheduled','ExecutionSucceeded','ExecutionFailed','ExecutionCancelled','ExecutionTimedOut','ExecutionDLQ',
]);

export const ToolEventTypeSchema = z.enum([
  'ToolInvocationStarted','ToolInvocationSucceeded','ToolInvocationFailed','ToolInvocationTimedOut','ToolApprovalRequested',
]);

export const LlmEventTypeSchema = z.enum([
  'LLMCallStarted','LLMCallCompleted','LLMCallFailed','LLMBudgetExceeded',
]);

export const ApprovalEventTypeSchema = z.enum([
  'ApprovalRequested','ApprovalGranted','ApprovalDenied','ApprovalExpired',
]);

export const F1EventTypeSchema = z.union([
  ExecutionEventTypeSchema,
  ToolEventTypeSchema,
  LlmEventTypeSchema,
  ApprovalEventTypeSchema,
]);

export type F1EventType = z.infer<typeof F1EventTypeSchema>;
