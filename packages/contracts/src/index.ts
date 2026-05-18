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
// Protocol-specific ExecutionContext aliased to avoid collision with domain type
export type { ExecutionContext as McpExecutionContext } from './protocols/mcp-a2a';

// F0-007 — AutoGen GroupChat Message & Event Contracts
// Explicit exports to avoid TS2308 ambiguity with mcp-a2a (MessageRole)
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
// GovernancePolicy also lives in execution.ts (runtime value-object) and policy.ts
// (persistent config entity). Export budget-governance explicitly to avoid TS2308.
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

// Core primitive contracts (canonical domain types — source of truth)
export * from './agent';

// execution.ts exports GovernancePolicy (runtime value-object VO).
// policy.ts also exports GovernancePolicy (persistent config entity).
// Both are valid but ambiguous under export *. Alias policy.ts version to avoid TS2308.
export type {
  TaskDefinition,
  ExecutionContext,
  ExecutionRequest,
  Execution,
  ExecutionStatus,
  TaskResult,
  ExecutionError,
  TokenUsage as ExecutionTokenUsage,
  TaskType,
  Task,
  ToolInvocation,
} from './execution';
// GovernancePolicy from execution.ts = runtime value-object (canonical for workers)
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
