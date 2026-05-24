import { describe, expect, it } from 'vitest';
import { EventEnvelopeSchema, validateEventPayload } from '../../events';

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
  payload: { agentId: 'a1' },
} as const;

describe('EventEnvelopeSchema', () => {
  it('validates valid envelope', () => {
    expect(EventEnvelopeSchema.parse(base).eventType).toBe('ExecutionQueued');
  });

  it('rejects wrong schemaVersion', () => {
    expect(() => EventEnvelopeSchema.parse({ ...base, schemaVersion: '1' })).toThrow();
  });

  it('validates payload by event type', () => {
    expect(validateEventPayload('ExecutionQueued', { agentId: 'a1' })).toEqual({ agentId: 'a1' });
    expect(() => validateEventPayload('ExecutionQueued', {})).toThrow();
  });
});
