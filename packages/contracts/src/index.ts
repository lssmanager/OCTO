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
// GovernancePolicy is the canonical export from execution.ts (via export * below).
// Re-exporting it here would cause TS2308 ambiguity — use named exclusion.
export * from './governance/budget-governance';

// F0-011 — agency-agents Template Format
export * from './templates/agent-template';

// Core primitive contracts (canonical domain types — source of truth)
export * from './agent';
export * from './execution'; // ExecutionContext, GovernancePolicy live here
export * from './events';
export * from './hierarchy';
export * from './memory';
export * from './policy';
