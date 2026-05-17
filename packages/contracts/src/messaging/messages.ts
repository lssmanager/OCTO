/**
 * F0-007 — AutoGen GroupChat Message & Event Contracts
 * Source of truth: ADR F0-007-autogen-groupchat-patterns.md
 *
 * Covers:
 *  - IMessage (base)
 *  - IChatMessage, ITextMessage, IStructuredMessage
 *  - IAgentEvent, IControlMessage
 *  - TokenUsage
 *  - TerminationCondition, SpeakerSelectionStrategy
 *  - GroupChatConfig (anticipates F6 multi-agent orchestration)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Base
// ─────────────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'agent';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Cost in USD */
  costUsd?: number;
  model?: string;
  provider?: string;
}

export interface IMessage {
  /** Unique message id (UUIDv7 recommended) */
  id: string;
  /** Correlation id — ties together messages in the same logical exchange */
  correlationId?: string;
  /** Run that produced this message */
  runId: string;
  /** Step within the run */
  stepId?: string;
  /** ISO 8601 */
  createdAt: string;
  role: MessageRole;
  /** Agent or user that authored the message */
  source: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Messages
// ─────────────────────────────────────────────────────────────────────────────

export interface IChatMessage extends IMessage {
  type: 'chat';
  content: string;
  /** Recipient agent id — undefined means broadcast to group */
  recipient?: string;
  usage?: TokenUsage;
}

export interface ITextMessage extends IChatMessage {
  contentType: 'text/plain';
}

export interface IStructuredMessage extends IMessage {
  type: 'structured';
  /** Fully typed payload — validated at runtime with Zod */
  payload: Record<string, unknown>;
  /** JSON Schema describing `payload` */
  schema?: object;
  usage?: TokenUsage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Events
// ─────────────────────────────────────────────────────────────────────────────

export type AgentEventType =
  | 'agent.started'
  | 'agent.thinking'
  | 'agent.responded'
  | 'agent.delegated'
  | 'agent.waiting'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.timeout';

export interface IAgentEvent extends IMessage {
  type: 'event';
  event: AgentEventType;
  agentId: string;
  payload?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Messages
// ─────────────────────────────────────────────────────────────────────────────

export type ControlMessageType =
  | 'terminate'
  | 'pause'
  | 'resume'
  | 'reset'
  | 'handoff'
  | 'escalate'
  | 'inject-context';

export interface IControlMessage extends IMessage {
  type: 'control';
  control: ControlMessageType;
  /** Reason / human-readable explanation */
  reason?: string;
  payload?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Termination
// ─────────────────────────────────────────────────────────────────────────────

export type TerminationReason =
  | 'max-turns-reached'
  | 'goal-achieved'
  | 'stall-detected'
  | 'error'
  | 'human-request'
  | 'timeout'
  | 'budget-exceeded';

export interface TerminationCondition {
  /** Hard turn cap — prevents infinite loops */
  maxTurns?: number;
  /** Stop if this string appears in any message content */
  stopWord?: string;
  /** Custom predicate — evaluated after each turn */
  predicate?: (messages: IMessage[]) => boolean;
  /** Stall detection: raise if no progress after N turns */
  stallAfterTurns?: number;
}

export interface TerminationResult {
  terminated: boolean;
  reason?: TerminationReason;
  turn?: number;
  finalMessage?: IMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaker Selection — anticipates F6 GroupChat orchestration
// ─────────────────────────────────────────────────────────────────────────────

export type SpeakerSelectionMode =
  | 'round-robin'
  | 'random'
  | 'selector-agent'
  | 'semantic-routing'
  | 'manual';

export interface SpeakerSelectionStrategy {
  mode: SpeakerSelectionMode;
  /** Agent id of the selector agent (when mode === 'selector-agent') */
  selectorAgentId?: string;
  /** Capability vector for semantic routing */
  routingEmbeddingField?: string;
  /** Ordered list of agent ids for round-robin */
  order?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// GroupChat Config (F6 preview)
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupChatConfig {
  id: string;
  name: string;
  /** Participant agent ids */
  participants: string[];
  termination: TerminationCondition;
  speakerSelection: SpeakerSelectionStrategy;
  /** Shared context injected to all participants */
  sharedContext?: Record<string, unknown>;
  /** When true, message history is visible to all participants */
  sharedHistory: boolean;
  maxReplanning?: number;
  metadata?: Record<string, unknown>;
}
