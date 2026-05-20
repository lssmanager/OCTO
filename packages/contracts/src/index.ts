/**
 * @octo/contracts — Public API
 *
 * Re-exports all contract interfaces and types from the OCTO platform.
 * Zero runtime dependencies — pure TypeScript types only.
 * Organised by ADR source.
 */

// F0-001 — Queue Name Contracts
export { QUEUE_NAMES, DLQ_NAMES, MONITORED_QUEUES } from './queue.contracts';
export type { QueueName } from './queue.contracts';

// F0-006 — MCP & A2A Protocol Contracts
export type {
  MCPTool,
  MCPServerConfig,
  MCPClient,
  MCPServer,
  AgentCard,
  AgentCapabilities,
  AgentSkill,
  AgentRegistration,
  AgentStatus,
  AgentVisibility,
  A2ATaskStatus,
  A2ATaskRef,
  A2ATaskRequest,
  A2AMessageEnvelope,
  A2AClient,
  MessageRole,
  AgentLevel,
  ContentPartType,
  ApprovalKind,
  ApprovalStatus,
  ApprovalRequest,
  ApprovalService,
  AgentMessage,
  ConversationEntry,
  AgentManifest,
  AgentManifestBudget,
  AgentManifestHeartbeat,
  WorkflowManifest,
  WorkflowStep,
  WorkflowStepKind,
  HandoffTool,
  HandoffResult,
} from './protocols/mcp-a2a';
export type { ExecutionContext as McpExecutionContext } from './protocols/mcp-a2a';

// F0-007 — AutoGen GroupChat Message & Event Contracts
export type {
  TokenUsage,
  IMessage,
  IChatMessage,
  ITextMessage,
  IStructuredMessage,
  AgentEventType,
  IAgentEvent,
  ControlMessageType,
  IControlMessage,
  TerminationReason,
  TerminationCondition,
  TerminationResult,
  SpeakerSelectionMode,
  SpeakerSelectionStrategy,
  GroupChatConfig,
} from './messaging/messages';

// F0-008 — CrewAI Agent Role Patterns / IAgentProfile
export * from './agents/agent-profile';

// F0-009 — Hermes Coordinator Patterns
export * from './coordination/coordinator';

// F0-010 — Paperclip Budget, Governance & Eval Contracts
export type {
  BudgetScope,
  IBudgetPolicy,
  BudgetCheckResult,
  CostEventType,
  CostEvent,
  ICostTracking,
  ModelCapabilityMatrix,
  IModelPolicy,
  IModelResolver,
  IGovernancePolicy,
  GovernanceRuleType,
  GovernanceRule,
  ApprovalTicketStatus,
  ApprovalTicket,
  IApprovalFlow,
  EvalMetricType,
  EvalMetric,
  IEvalCase,
  IEvalBundle,
  EvalCaseResult,
  EvalRunResult,
  ComparisonReport,
  IEvalRunner,
} from './governance/budget-governance';

// F0-011 — agency-agents Template Format
export * from './templates/agent-template';

// Core primitive contracts
export * from './agent';

// ─── execution.ts ─────────────────────────────────────────────────────────────
// Single export block for both runtime values (const objects) and types.
// FIX: removed the duplicate `export type { InvalidTransitionError }` that caused TS2300.
// InvalidTransitionError is already exported as a value above — no separate type export needed.
export {
  // Const enum objects (runtime values + inferred types)
  ExecutionStatus,
  StepType,
  StepStatus,
  TriggerSource,
  DlqReason,
  IdempotencyScope,
  ExecutionStatusValues,
  StepTypeValues,
  // State machine
  VALID_TRANSITIONS,
  VALID_STEP_TRANSITIONS,
  // Validators
  assertValidTransition,
  canTransition,
  canTransitionStep,
  // Status predicates
  isTerminalStatus,
  isActiveStatus,
  isBlockedStatus,
  TERMINAL_STATUSES,
  // Error classes
  ExecutionTransitionError,
  InvalidTransitionError,
} from './execution';

export type {
  // Pure interfaces (no duplicate of InvalidTransitionError here)
  GovernancePolicy,
  TaskDefinition,
  ExecutionContext,
  ExecutionRequest,
  Execution,
  ExecutionSummary,
  TaskResult,
  ExecutionError,
  TokenUsage as ExecutionTokenUsage,
  CostUsage,
  TaskType,
  Task,
  ToolInvocation,
  StepTransition,
} from './execution';

// policy.ts GovernancePolicy aliased to avoid collision with execution.ts GovernancePolicy
export type {
  GovernancePolicy as PersistentGovernancePolicy,
  TokenBudget,
  ExecutionBudget,
  ToolPermission,
  ApprovalTrigger,
} from './policy';

export * from './events';
export * from './hierarchy';
export * from './memory';
