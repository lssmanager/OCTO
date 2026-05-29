import { z } from 'zod';
import { EventEnvelopeSchema } from './envelope';
import { type F1EventType } from './event-types';
import { EventPayloadSchemaByType } from './payload-registry';

export const EventAggregateTypeSchema = z.enum(['Execution', 'ToolInvocation', 'Approval']);
export type F1AggregateType = z.infer<typeof EventAggregateTypeSchema>;

const EVENT_AGGREGATE: Record<F1EventType, F1AggregateType> = {
  ExecutionQueued: 'Execution', ExecutionDispatched: 'Execution', ExecutionStarted: 'Execution', ExecutionCheckpointed: 'Execution', ExecutionStepCompleted: 'Execution', ExecutionPaused: 'Execution', ExecutionResumed: 'Execution', ExecutionReclaiming: 'Execution', ExecutionReclaimed: 'Execution', ExecutionRetryScheduled: 'Execution', ExecutionSucceeded: 'Execution', ExecutionFailed: 'Execution', ExecutionCancelled: 'Execution', ExecutionCancellationRequested: 'Execution', ExecutionResumeRequested: 'Execution', ExecutionRoutedToDLQ: 'Execution', ExecutionTimedOut: 'Execution', ExecutionDLQ: 'Execution',
  ToolInvocationStarted: 'ToolInvocation', ToolInvocationSucceeded: 'ToolInvocation', ToolInvocationFailed: 'ToolInvocation', ToolInvocationTimedOut: 'ToolInvocation', ToolApprovalRequested: 'ToolInvocation',
  LLMCallStarted: 'Execution', LLMCallCompleted: 'Execution', LLMCallFailed: 'Execution', LLMBudgetExceeded: 'Execution', LLMUsageRecorded: 'Execution',
  ApprovalRequested: 'Approval', ApprovalGranted: 'Approval', ApprovalDenied: 'Approval', ApprovalExpired: 'Approval',
};

export function getPayloadSchemaForEventType(eventType: F1EventType) { return EventPayloadSchemaByType[eventType]; }
export function getAggregateTypeForEventType(eventType: F1EventType): F1AggregateType { return EVENT_AGGREGATE[eventType]; }

export function validateEventEnvelope(input: unknown) { return EventEnvelopeSchema.parse(input); }
export function validateTypedEventEnvelope(input: unknown) {
  const envelope = EventEnvelopeSchema.parse(input);
  const expectedAggregate = getAggregateTypeForEventType(envelope.eventType as F1EventType);
  if (envelope.aggregateType !== expectedAggregate) throw new Error(`Invalid aggregateType for ${envelope.eventType}. expected=${expectedAggregate} actual=${envelope.aggregateType}`);
  getPayloadSchemaForEventType(envelope.eventType as F1EventType).parse(envelope.payload);
  return envelope;
}
