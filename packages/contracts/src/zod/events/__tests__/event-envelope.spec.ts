import { describe, expect, it } from 'vitest';
import { EventEnvelopeSchema, EventPayloadSchemaByType, validateEventPayload } from '../../events';

const base = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventType: 'ExecutionQueued',
  tenantId: 't1',
  aggregateType: 'Execution',
  aggregateId: 'e1',
  sequence: 0,
  traceId: 'trace',
  spanId: 'span',
  occurredAt: '2026-05-24T00:00:00.000Z',
  schemaVersion: '1.0',
  payload: { agentId: 'a1', inputHash: 'h1' },
} as const;

describe('EventEnvelopeSchema', () => {
  it('validates valid envelope', () => {
    expect(EventEnvelopeSchema.parse(base).eventType).toBe('ExecutionQueued');
  });

  it('rejects wrong schemaVersion', () => {
    expect(() => EventEnvelopeSchema.parse({ ...base, schemaVersion: '1' })).toThrow();
  });

  it('rejects missing trace/span', () => {
    expect(() => EventEnvelopeSchema.parse({ ...base, traceId: '' })).toThrow();
    expect(() => EventEnvelopeSchema.parse({ ...base, spanId: '' })).toThrow();
  });

  it('validates payload by event type catalog', () => {
    for (const [type, schema] of Object.entries(EventPayloadSchemaByType)) {
      const sample = type === 'ExecutionQueued' ? { agentId: 'a1', inputHash: 'h1' } : (() => {
        switch (type) {
          case 'ExecutionDispatched': return { attemptNumber: 1, leaseOwner: 'w1' };
          case 'ExecutionStarted': return { workerId: 'w1', checkpointId: 'cp1' };
          case 'ExecutionStepCompleted': return { stepIndex: 1, stepType: 'tool', status: 'ok' };
          case 'ExecutionPaused': return { approvalId: 'ap1', reason: 'needs approval' };
          case 'ExecutionResumed': return { approvalId: 'ap1', resolution: 'approved' };
          case 'ExecutionReclaiming': return { staleLeaseOwner: 'a', newLeaseOwner: 'b' };
          case 'ExecutionReclaimed': return { lastCheckpointId: 'cp1', stepIndex: 1 };
          case 'ExecutionRetryScheduled': return { errorCode: 'E', nextAttemptAt: '2026-05-24T00:00:00.000Z', attemptNumber: 2 };
          case 'ExecutionSucceeded': return { outputSummary: 'done', totalTokens: 10, durationMs: 1000 };
          case 'ExecutionFailed': return { errorCode: 'E', errorMessage: 'fail', finalAttempt: true };
          case 'ExecutionCancelled': return { cancelledBy: 'ops', reason: 'manual' };
          case 'ExecutionTimedOut': return { timeoutMs: 1000, lastStepIndex: 1 };
          case 'ExecutionDLQ': return { poisonSignature: 'sig', jobId: 'job' };
          case 'ToolInvocationStarted': return { toolName: 'bash', toolKind: 'system', argsHash: 'h' };
          case 'ToolInvocationSucceeded': return { toolName: 'bash', durationMs: 1 };
          case 'ToolInvocationFailed': return { toolName: 'bash', errorCode: 'E' };
          case 'ToolInvocationTimedOut': return { toolName: 'bash', timeoutMs: 1 };
          case 'ToolApprovalRequested': return { toolName: 'bash', approvalId: 'ap1' };
          case 'LLMCallStarted': return { model: 'gpt', provider: 'openai', stepIndex: 1 };
          case 'LLMCallCompleted': return { model: 'gpt', inputTokens: 1, outputTokens: 1, finishReason: 'stop', latencyMs: 10 };
          case 'LLMCallFailed': return { errorCode: 'E', provider: 'openai', model: 'gpt', attempt: 1 };
          case 'LLMBudgetExceeded': return { remainingBudgetUsd: '0.00', requiredMinUsd: '0.01' };
          case 'ApprovalRequested': return { kind: 'human', title: 'approve', reason: 'risk', timeoutAt: '2026-05-24T00:00:00.000Z' };
          case 'ApprovalGranted': return { resolvedBy: 'u1', resolutionSummary: 'ok' };
          case 'ApprovalDenied': return { resolvedBy: 'u1', denyReason: 'no' };
          case 'ApprovalExpired': return { timeoutAt: '2026-05-24T00:00:00.000Z' };
          default: return {};
        }
      })();
      expect(schema.parse(sample)).toBeDefined();
      expect(validateEventPayload(type as never, sample)).toBeDefined();
    }
  });
});
