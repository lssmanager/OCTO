import { describe, expect, it } from 'vitest';
import { validateTypedEventEnvelope, getAggregateTypeForEventType } from '../../events';

const base = {
  eventId: '550e8400-e29b-41d4-a716-446655440000', eventType: 'ToolInvocationStarted', tenantId: 't1', aggregateType: 'ToolInvocation', aggregateId: 'a1', sequence: 0, traceId: 'tr', spanId: 'sp', occurredAt: '2026-05-25T00:00:00.000Z', schemaVersion: '1.0', payload: { toolName: 'bash', toolKind: 'system', argsHash: 'h' },
};

describe('typed envelope validation', () => {
  it('validates payload and aggregate mapping', () => {
    expect(validateTypedEventEnvelope(base).eventType).toBe('ToolInvocationStarted');
    expect(getAggregateTypeForEventType('LLMCallStarted')).toBe('Execution');
  });
  it('rejects invalid aggregate for event', () => {
    expect(() => validateTypedEventEnvelope({ ...base, aggregateType: 'Execution' })).toThrow();
  });
});
