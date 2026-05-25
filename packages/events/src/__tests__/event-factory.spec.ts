import { describe, expect, it } from 'vitest';
import { createEventEnvelope } from '../event-factory';

describe('createEventEnvelope', () => {
  it('infers aggregateType and validates payload', () => {
    const evt = createEventEnvelope({
      eventType: 'ToolInvocationStarted',
      tenantId: 't1',
      aggregateId: 'tool-1',
      sequence: 0,
      traceId: 'trace',
      spanId: 'span',
      payload: { toolName: 'bash', toolKind: 'system', argsHash: 'h' },
    });
    expect(evt.aggregateType).toBe('ToolInvocation');
    expect(evt.schemaVersion).toBe('1.0');
  });

  it('rejects mismatched payload by eventType', () => {
    expect(() =>
      createEventEnvelope({
        eventType: 'ToolInvocationStarted',
        tenantId: 't1',
        aggregateId: 'tool-1',
        sequence: 0,
        traceId: 'trace',
        spanId: 'span',
        payload: { toolName: 'bash' },
      })
    ).toThrow();
  });
});
