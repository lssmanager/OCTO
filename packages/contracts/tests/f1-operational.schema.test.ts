import { describe, expect, it } from 'vitest';
import {
  AgentVersionSchema,
  OutboxEventTypeSchema,
  OutboxEventSchema,
  ApprovalSchema,
  ToolInvocationSchema,
} from '../src/zod';

describe('ToolInvocationSchema', () => {
  const base = { id: 't1', tenantId: 'ten', executionId: 'e1', stepId: 's1', toolName: 'search', toolKind: 'builtin_sync', status: 'PENDING', argsJson: {}, requiresApproval: false, idempotencyKey: 'k', startedAt: '2026-01-01T00:00:00Z' };
  it('valid object passes', () => expect(() => ToolInvocationSchema.parse(base)).not.toThrow());
  it('invalid toolKind fails', () => expect(() => ToolInvocationSchema.parse({ ...base, toolKind: 'bad' })).toThrow());
  it('invalid status fails', () => expect(() => ToolInvocationSchema.parse({ ...base, status: 'bad' })).toThrow());
  it('invalid durationMs non-integer fails', () => expect(() => ToolInvocationSchema.parse({ ...base, durationMs: 1.2 })).toThrow());
  it('invalid datetime fails', () => expect(() => ToolInvocationSchema.parse({ ...base, startedAt: 'bad' })).toThrow());
  it('nullable result/error fields pass', () => expect(() => ToolInvocationSchema.parse({ ...base, resultJson: null, errorCode: null, errorMessage: null, endedAt: null })).not.toThrow());
});

describe('ApprovalSchema', () => {
  const base = { id: 'a1', tenantId: 'ten', executionId: 'e1', stepId: 's1', kind: 'tool_execution', status: 'PENDING', title: 'approve', reason: 'needed', payloadJson: {} };
  it('valid object passes', () => expect(() => ApprovalSchema.parse(base)).not.toThrow());
  it('invalid kind fails', () => expect(() => ApprovalSchema.parse({ ...base, kind: 'x' })).toThrow());
  it('invalid status fails', () => expect(() => ApprovalSchema.parse({ ...base, status: 'x' })).toThrow());
  it('invalid timeoutAt/resolvedAt datetime fails', () => expect(() => ApprovalSchema.parse({ ...base, timeoutAt: 'bad' })).toThrow());
  it('nullable resolutionJson passes', () => expect(() => ApprovalSchema.parse({ ...base, resolutionJson: null, resolvedAt: null, resolvedBy: null, timeoutAt: null })).not.toThrow());
});

describe('OutboxEventSchema', () => {
  const base = { id: 'o1', tenantId: 'ten', aggregateType: 'execution', aggregateId: 'e1', eventType: 'ExecutionQueued', sequence: 1, payloadJson: {}, createdAt: '2026-01-01T00:00:00Z' };
  it('valid object passes', () => expect(() => OutboxEventSchema.parse(base)).not.toThrow());
  it('invalid aggregateType fails', () => expect(() => OutboxEventSchema.parse({ ...base, aggregateType: 'x' })).toThrow());
  it('invalid eventType fails', () => expect(() => OutboxEventSchema.parse({ ...base, eventType: 'x' })).toThrow());
  it('non-integer sequence fails', () => expect(() => OutboxEventSchema.parse({ ...base, sequence: 1.3 })).toThrow());
  it('nullable publishedAt passes', () => expect(() => OutboxEventSchema.parse({ ...base, publishedAt: null })).not.toThrow());
  it('event type enum includes all mandatory F1 events', () => {
    const values = OutboxEventTypeSchema.options;
    ['ExecutionQueued','ExecutionDispatched','ExecutionStarted','ExecutionStepCompleted','ExecutionPaused','ExecutionResumed','ExecutionReclaiming','ExecutionReclaimed','ExecutionRetryScheduled','ExecutionSucceeded','ExecutionFailed','ExecutionCancelled','ExecutionTimedOut','ExecutionDLQ','ToolInvocationStarted','ToolInvocationSucceeded','ToolInvocationFailed','ToolInvocationTimedOut','ToolApprovalRequested','LLMCallStarted','LLMCallCompleted','LLMCallFailed','LLMBudgetExceeded','ApprovalRequested','ApprovalGranted','ApprovalDenied','ApprovalExpired'].forEach((v)=>expect(values).toContain(v));
  });
});

describe('AgentVersionSchema', () => {
  const base = { id: 'av1', tenantId: 'ten', agentId: 'a1', version: 1, createdAt: '2026-01-01T00:00:00Z', configJson: { name: 'Agent', instructions: 'Do', workspaceId: 'w1', modelPolicy: { primaryModel: 'gpt-4.1' }, toolPolicy: { allow: ['search'] }, budgetPolicy: { maxUsdPerRun: '10.00', maxUsdPerDay: '50.00' } } };
  it('valid config passes', () => expect(() => AgentVersionSchema.parse(base)).not.toThrow());
  it('missing required fields fail', () => expect(() => AgentVersionSchema.parse({ ...base, configJson: { instructions: 'x' } })).toThrow());
  it('defaults work', () => {
    const parsed = AgentVersionSchema.parse(base);
    expect(parsed.configJson.modelPolicy.fallbackModels).toEqual([]);
    expect(parsed.configJson.modelPolicy.fallbackChain).toEqual([]);
    expect(parsed.configJson.modelPolicy.allowedModels).toEqual([]);
    expect(parsed.configJson.modelPolicy.registeredModels).toEqual([]);
    expect(parsed.configJson.modelPolicy.temperature).toBe(0.2);
    expect(parsed.configJson.modelPolicy.maxOutputTokens).toBe(2048);
    expect(parsed.configJson.budgetPolicy.hardStop).toBe(true);
    expect(parsed.configJson.budgetPolicy.minReservedCostUsd).toBe('0.000001');
    expect(parsed.configJson.budgetPolicy.currentSpendUsd).toBe('0');
    expect(parsed.configJson.budgetPolicy.onExhaust).toBe('fail');
    expect(parsed.configJson.executionTimeoutMs).toBe(900000);
  });
  it('invalid budget string fails', () => expect(() => AgentVersionSchema.parse({ ...base, configJson: { ...base.configJson, budgetPolicy: { ...base.configJson.budgetPolicy, maxUsdPerRun: '10' } } })).toThrow());
  it('invalid temperature > 2 fails', () => expect(() => AgentVersionSchema.parse({ ...base, configJson: { ...base.configJson, modelPolicy: { ...base.configJson.modelPolicy, temperature: 2.1 } } })).toThrow());
  it('invalid maxOutputTokens non-integer fails', () => expect(() => AgentVersionSchema.parse({ ...base, configJson: { ...base.configJson, modelPolicy: { ...base.configJson.modelPolicy, maxOutputTokens: 10.5 } } })).toThrow());
});
