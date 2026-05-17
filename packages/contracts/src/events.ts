// Core domain event contracts
// These are the events that drive the event bus and reconstruct execution timelines.

export type OctoEventType =
  | 'ExecutionStarted'
  | 'ExecutionCompleted'
  | 'ExecutionFailed'
  | 'ExecutionPaused'
  | 'ExecutionResumed'
  | 'ExecutionCancelled'
  | 'DelegationCreated'
  | 'ToolInvoked'
  | 'ToolCompleted'
  | 'ToolFailed'
  | 'ApprovalRequested'
  | 'ApprovalGranted'
  | 'ApprovalRejected'
  | 'MemoryRetrieved'
  | 'MemoryWritten'
  | 'AgentSpawned'
  | 'CheckpointCreated'
  | 'BudgetExceeded';

export interface OctoEvent<T = unknown> {
  id: string;
  type: OctoEventType;
  traceId: string;
  executionId: string;
  agentId: string;
  payload: T;
  occurredAt: Date;
}
