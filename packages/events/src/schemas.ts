import { randomUUID } from 'crypto';
import type { OctoEvent, OctoEventType } from '@octo/contracts';

export function createEvent<T>(
  type: OctoEventType,
  payload: T,
  context: { traceId: string; executionId: string; agentId: string }
): OctoEvent<T> {
  return {
    id: randomUUID(),
    type,
    traceId: context.traceId,
    executionId: context.executionId,
    agentId: context.agentId,
    payload,
    occurredAt: new Date(),
  };
}
