/**
 * @octo/contracts — Public API
 *
 * Re-exports all contract interfaces and types from the OCTO platform.
 * Zero runtime dependencies — pure TypeScript types only.
 * Organised by ADR source.
 */

// F0-006 — MCP & A2A Protocol Contracts
// Explicit exports to avoid TS2308 ambiguity with domain types
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

// ─── execution.ts exports ────────────────────────────────────────────────────
// Canonical source of truth for execution state machine, enums, and types.
// TokenUsage also exported from messaging/messages.ts — aliased here to avoid TS2308.
export type {
  // Enums (const objects + type aliases)
  ExecutionStatus,
  StepType,
  StepStatus,
  TriggerSource,
  DlqReason,
  IdempotencyScope,
  // Value arrays (for Zod .enum() and iteration)
  ExecutionStatusValues,
  StepTypeValues,
  // State machine maps
  // (exported as values, not types, so the const object is importable at runtime)
  // Type-only consumers use `typeof VALID_TRANSITIONS`
  // Runtime consumers import the object directly.
} from './execution';

export {
  // Runtime-available const enum objects
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
  // Error class
  ExecutionTransitionError,
} from './execution';

export type {
  // Interfaces
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

export type { GovernancePolicy } from './execution';

// policy.ts GovernancePolicy = persistent config entity — aliased to avoid collision
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
