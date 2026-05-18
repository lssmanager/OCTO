import type { OctoEventType, OctoEvent } from '@octo/contracts';
import { createEvent as createOctoEvent } from '@octo/contracts';

export function createEvent<T>(
  type: OctoEventType,
  payload: T,
  context: {
    traceId: string;
    executionId?: string;
    agentId?: string;
    runId: string;
    tenantId: string;
    source: string;
  }
): OctoEvent<T> {
  return createOctoEvent(type, payload, {
    traceId: context.traceId,
    executionId: context.executionId,
    agentId: context.agentId,
    runId: context.runId,
    tenantId: context.tenantId,
    source: context.source,
  });
}
