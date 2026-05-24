import { z } from 'zod';
import { F1EventType } from './event-types';

const NonEmpty = z.string().min(1);
const Int = z.number().int().nonnegative();

export const EventPayloadSchemaByType = {
  ExecutionQueued: z.object({ agentId: NonEmpty }),
  ExecutionDispatched: z.object({ attemptNumber: Int, leaseOwner: NonEmpty }),
  ExecutionStarted: z.object({ workerId: NonEmpty }),
  ExecutionStepCompleted: z.object({ stepIndex: Int, stepType: NonEmpty, status: NonEmpty }),
  ExecutionPaused: z.object({ reason: NonEmpty }),
  ExecutionResumed: z.object({ resolution: NonEmpty }),
  ExecutionReclaiming: z.object({ staleLeaseOwner: NonEmpty, newLeaseOwner: NonEmpty }),
  ExecutionReclaimed: z.object({ stepIndex: Int }),
  ExecutionRetryScheduled: z.object({ errorCode: NonEmpty, attemptNumber: Int }),
  ExecutionSucceeded: z.object({ durationMs: Int }),
  ExecutionFailed: z.object({ errorCode: NonEmpty, errorMessage: NonEmpty, finalAttempt: z.boolean() }),
  ExecutionCancelled: z.object({ cancelledBy: NonEmpty, reason: NonEmpty }),
  ExecutionTimedOut: z.object({ timeoutMs: z.number().int().positive() }),
  ExecutionDLQ: z.object({ poisonSignature: NonEmpty, jobId: NonEmpty }),
  ToolInvocationStarted: z.object({ toolName: NonEmpty }),
  ToolInvocationSucceeded: z.object({ toolName: NonEmpty, durationMs: Int }),
  ToolInvocationFailed: z.object({ toolName: NonEmpty, errorCode: NonEmpty }),
  ToolInvocationTimedOut: z.object({ toolName: NonEmpty, timeoutMs: z.number().int().positive() }),
  ToolApprovalRequested: z.object({ toolName: NonEmpty, approvalId: NonEmpty }),
  LLMCallStarted: z.object({ model: NonEmpty, provider: NonEmpty, stepIndex: Int }),
  LLMCallCompleted: z.object({ model: NonEmpty, inputTokens: Int, outputTokens: Int }),
  LLMCallFailed: z.object({ errorCode: NonEmpty, provider: NonEmpty, model: NonEmpty, attempt: Int }),
  LLMBudgetExceeded: z.object({ remainingBudgetUsd: NonEmpty, requiredMinUsd: NonEmpty }),
  ApprovalRequested: z.object({ kind: NonEmpty, title: NonEmpty, reason: NonEmpty }),
  ApprovalGranted: z.object({ resolvedBy: NonEmpty, resolutionSummary: NonEmpty }),
  ApprovalDenied: z.object({ resolvedBy: NonEmpty, denyReason: NonEmpty }),
  ApprovalExpired: z.object({ timeoutAt: z.string().datetime() }),
} as const;

export function validateEventPayload(eventType: F1EventType, payload: unknown): Record<string, unknown> {
  const schema = EventPayloadSchemaByType[eventType];
  if (!schema) throw new Error(`Unknown event type: ${eventType}`);
  return schema.parse(payload);
}
