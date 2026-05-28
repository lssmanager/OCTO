import { describe, expect, it } from 'vitest';
import { ExecutionSchema, ExecutionStepSchema } from '../src/zod';

describe('ExecutionSchema', () => {
  const base = {
    id: 'exec_1', tenantId: 'tenant_1', agentId: 'agent_1', agentVersionId: 'ver_1',
    state: 'running', version: 1, inputJson: { a: 1 }, attemptCount: 0, reclaimCount: 0,
    createdBy: 'user_1', createdAt: '2026-05-23T10:00:00Z', updatedAt: '2026-05-23T10:00:01Z',
  };
  it('accepts valid execution', () => expect(() => ExecutionSchema.parse(base)).not.toThrow());
  it('rejects invalid state', () => expect(() => ExecutionSchema.parse({ ...base, state: 'BAD' })).toThrow());
  it('rejects non-integer version', () => expect(() => ExecutionSchema.parse({ ...base, version: 1.2 })).toThrow());
  it('rejects invalid datetime', () => expect(() => ExecutionSchema.parse({ ...base, createdAt: 'bad' })).toThrow());
  it('accepts nullable optional fields', () => {
    expect(() => ExecutionSchema.parse({ ...base, outputJson: null, errorCode: null, errorMessage: null, leaseOwner: null, leaseExpiresAt: null, cancellationRequestedAt: null, budgetSnapshotJson: null, contextSnapshotJson: null })).not.toThrow();
  });
});

describe('ExecutionStepSchema', () => {
  const base = {
    id: 'step_1', tenantId: 'tenant_1', executionId: 'exec_1', stepIndex: 1, stepType: 'tool', status: 'RUNNING', startedAt: '2026-05-23T10:00:00Z',
  };
  it('accepts valid step', () => expect(() => ExecutionStepSchema.parse(base)).not.toThrow());
  it('rejects non-integer stepIndex', () => expect(() => ExecutionStepSchema.parse({ ...base, stepIndex: 1.5 })).toThrow());
  it('rejects invalid datetime', () => expect(() => ExecutionStepSchema.parse({ ...base, startedAt: 'bad-date' })).toThrow());
  it('accepts nullable output/error fields', () => expect(() => ExecutionStepSchema.parse({ ...base, outputJson: null, errorCode: null, errorMessage: null, endedAt: null })).not.toThrow());
});

describe('ExecutionStatus contract', () => {
  it('exports only canonical lowercase execution states', async () => {
    const { ExecutionStatusValues } = await import('../src/execution');
    expect(ExecutionStatusValues).toEqual([
      'pending',
      'queued',
      'dispatched',
      'running',
      'waiting_tool',
      'waiting_human',
      'retrying',
      'retry_scheduled',
      'suspended',
      'reclaimable',
      'completed',
      'failed',
      'cancelled',
    ]);
    expect(ExecutionStatusValues.every((state) => state === state.toLowerCase())).toBe(true);
  });

  it('keeps canonical F1 transitions and terminal states', async () => {
    const { canTransition, TERMINAL_STATUSES } = await import('../src/execution');
    expect(canTransition('queued', 'dispatched')).toBe(true);
    expect(canTransition('dispatched', 'running')).toBe(true);
    expect(canTransition('running', 'completed')).toBe(true);
    expect(canTransition('running', 'failed')).toBe(true);
    expect(canTransition('running', 'cancelled')).toBe(true);
    expect(canTransition('queued', 'running')).toBe(false);
    expect([...TERMINAL_STATUSES]).toEqual(['completed', 'failed', 'cancelled']);
  });
});
