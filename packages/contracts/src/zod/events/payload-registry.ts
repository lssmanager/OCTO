import { z } from 'zod';
import { F1EventType } from './event-types';

const NonEmpty = z.string().min(1);
const Int = z.number().int().nonnegative();

export const EventPayloadSchemaByType = {
  ExecutionQueued: z.object({ agentId: NonEmpty, inputSummary: NonEmpty.optional(), inputHash: NonEmpty.optional() }).refine((v)=>Boolean(v.inputSummary||v.inputHash), { message: 'inputSummary or inputHash is required' }),
  ExecutionDispatched: z.object({ attemptNumber: Int, leaseOwner: NonEmpty }),
  ExecutionStarted: z.object({ workerId: NonEmpty.optional(), checkpointId: NonEmpty.optional(), executionId: NonEmpty.optional(), traceId: z.string().optional() }).passthrough(),
  ExecutionCheckpointed: z.object({ checkpointId: NonEmpty.optional(), executionId: NonEmpty.optional() }).passthrough(),
  ExecutionStepCompleted: z.object({ stepIndex: Int, stepType: NonEmpty, status: NonEmpty }),
  ExecutionPaused: z.object({ approvalId: NonEmpty.optional(), reason: NonEmpty }),
  ExecutionResumed: z.object({ approvalId: NonEmpty.optional(), resolution: NonEmpty }),
  ExecutionReclaiming: z.object({ staleLeaseOwner: NonEmpty, newLeaseOwner: NonEmpty }),
  ExecutionReclaimed: z.object({ lastCheckpointId: NonEmpty.optional(), stepIndex: Int }),
  ExecutionRetryScheduled: z.object({ errorCode: NonEmpty, nextAttemptAt: z.string().datetime().optional(), attemptNumber: Int }),
  ExecutionSucceeded: z.object({ outputSummary: NonEmpty.optional(), totalTokens: Int.optional(), durationMs: Int }),
  ExecutionFailed: z.object({ errorCode: NonEmpty, errorMessage: NonEmpty, finalAttempt: z.boolean() }),
  ExecutionCancelled: z.object({ cancelledBy: NonEmpty.optional(), reason: NonEmpty.optional() }).passthrough(),
  ExecutionCancellationRequested: z.object({ executionId: NonEmpty.optional(), command: NonEmpty.optional() }).passthrough(),
  ExecutionResumeRequested: z.object({ executionId: NonEmpty.optional(), command: NonEmpty.optional() }).passthrough(),
  ExecutionRoutedToDLQ: z.object({ executionId: NonEmpty.optional(), errorCode: NonEmpty.optional(), reason: NonEmpty.optional() }).passthrough(),
  ExecutionTimedOut: z.object({ timeoutMs: z.number().int().positive(), lastStepIndex: Int.optional() }),
  ExecutionDLQ: z.object({ poisonSignature: NonEmpty, jobId: NonEmpty }),
  ToolInvocationStarted: z.object({ toolName: NonEmpty, toolKind: NonEmpty, argsHash: NonEmpty }),
  ToolInvocationSucceeded: z.object({ toolName: NonEmpty, durationMs: Int }),
  ToolInvocationFailed: z.object({ toolName: NonEmpty, errorCode: NonEmpty }),
  ToolInvocationTimedOut: z.object({ toolName: NonEmpty, timeoutMs: z.number().int().positive() }),
  ToolApprovalRequested: z.object({ toolName: NonEmpty, approvalId: NonEmpty }),
  LLMCallStarted: z.object({ model: NonEmpty, provider: NonEmpty, stepIndex: Int }),
  LLMCallCompleted: z.object({ model: NonEmpty, inputTokens: Int, outputTokens: Int, finishReason: NonEmpty, latencyMs: Int }),
  LLMCallFailed: z.object({ errorCode: NonEmpty, provider: NonEmpty, model: NonEmpty, attempt: Int }),
  LLMBudgetExceeded: z.object({ remainingBudgetUsd: NonEmpty, requiredMinUsd: NonEmpty }),
  LLMUsageRecorded: z.object({ execution_id: NonEmpty.optional(), agent_id: NonEmpty.optional(), step_id: NonEmpty.optional() }).passthrough(),
  ApprovalRequested: z.object({ kind: NonEmpty, title: NonEmpty, reason: NonEmpty, timeoutAt: z.string().datetime() }),
  ApprovalGranted: z.object({ resolvedBy: NonEmpty, resolutionSummary: NonEmpty }),
  ApprovalDenied: z.object({ resolvedBy: NonEmpty, denyReason: NonEmpty }),
  ApprovalExpired: z.object({ timeoutAt: z.string().datetime() }),
} as const;

export function validateEventPayload(eventType: F1EventType, payload: unknown): Record<string, unknown> {
  const schema = EventPayloadSchemaByType[eventType];
  if (!schema) throw new Error(`Unknown event type: ${eventType}`);
  return schema.parse(payload);
}
