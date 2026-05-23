import { describe, expect, it } from 'vitest';
import { ExecutionSchema, ExecutionStepSchema } from './execution.schema';

describe('ExecutionSchema', () => {
  const valid = {
    id: 'e1', tenantId: 't1', agentId: 'a1', agentVersionId: 'av1', state: 'RUNNING', version: 1,
    inputJson: { hello: 'world' }, attemptCount: 0, reclaimCount: 0, createdBy: 'user',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z',
  };

  it('accepts valid execution', () => expect(ExecutionSchema.parse(valid)).toBeTruthy());
  it('rejects invalid state', () => expect(() => ExecutionSchema.parse({ ...valid, state: 'pending' })).toThrow());
  it('rejects non-integer version', () => expect(() => ExecutionSchema.parse({ ...valid, version: 1.2 })).toThrow());
  it('rejects invalid datetime', () => expect(() => ExecutionSchema.parse({ ...valid, createdAt: 'nope' })).toThrow());
  it('accepts nullable optional fields', () => expect(ExecutionSchema.parse({ ...valid, outputJson: null, errorCode: null, leaseOwner: null, leaseExpiresAt: null })).toBeTruthy());
});

describe('ExecutionStepSchema', () => {
  const validStep = {
    id: 's1', tenantId: 't1', executionId: 'e1', stepIndex: 0, stepType: 'tool', status: 'RUNNING',
    startedAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts valid step', () => expect(ExecutionStepSchema.parse(validStep)).toBeTruthy());
  it('rejects non-integer stepIndex', () => expect(() => ExecutionStepSchema.parse({ ...validStep, stepIndex: 1.1 })).toThrow());
  it('rejects invalid datetime', () => expect(() => ExecutionStepSchema.parse({ ...validStep, startedAt: 'bad' })).toThrow());
  it('accepts nullable output/error fields', () => expect(ExecutionStepSchema.parse({ ...validStep, outputJson: null, errorCode: null, errorMessage: null, endedAt: null })).toBeTruthy());
});
