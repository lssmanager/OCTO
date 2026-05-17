/**
 * F0-008 — CrewAI Agent Role Patterns / IAgentProfile
 * Source of truth: ADR F0-008-crewai-agent-role-patterns.md
 *
 * IAgentProfile is the full persistent model of an agent.
 * It is the canonical representation stored in PostgreSQL and
 * compiled by the context builder at runtime.
 */

import type { AgentCapabilities, AgentSkill } from '../protocols/mcp-a2a';

// ─────────────────────────────────────────────────────────────────────────────
// LLM Config
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMConfig {
  /** Primary model identifier (e.g. 'gpt-4o', 'claude-3-5-sonnet') */
  primary: string;
  /** Ordered fallback chain */
  fallback?: string[];
  /** Temperature 0–2 */
  temperature?: number;
  maxTokens?: number;
  /** Reference to a model policy in the governance layer */
  policyRef?: string;
  provider?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Limits
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutionLimits {
  maxUsdPerRun?: number;
  maxTokensPerRun?: number;
  maxToolRoundsPerRun?: number;
  maxDelegationDepth?: number;
  maxConcurrentRuns?: number;
  /** Timeout per run in seconds */
  runTimeoutSecs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory Config
// ─────────────────────────────────────────────────────────────────────────────

export type MemoryScopeLevel = 'agent' | 'workspace' | 'department' | 'agency';

export interface MemoryConfig {
  scope: MemoryScopeLevel;
  /** Enable semantic/vector retrieval */
  vectorRetrieval: boolean;
  /** Enable episodic memory (per-run snapshots) */
  episodic: boolean;
  /** Enable shared knowledge graph contribution */
  knowledgeGraph: boolean;
  /** Max items retrieved per run */
  topK?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Binding
// ─────────────────────────────────────────────────────────────────────────────

export type ChannelType = 'whatsapp' | 'telegram' | 'discord' | 'teams' | 'webchat' | 'api';

export interface ChannelBinding {
  channelType: ChannelType;
  channelId: string;
  /** Routing expression — e.g. phone number, webhook path, guild id */
  routing?: string;
  /** Whether this binding is the default entry for inbound messages */
  isDefault?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delegation Config
// ─────────────────────────────────────────────────────────────────────────────

export interface DelegationConfig {
  /** Can this agent delegate tasks to sub-agents? */
  canDelegate: boolean;
  /** Can this agent accept delegated tasks from parent agents? */
  canAcceptDelegation: boolean;
  /** Maximum number of concurrent sub-delegations */
  maxConcurrentDelegations?: number;
  /** Ids of agents this agent is allowed to delegate to */
  allowedDelegateeIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation State
// ─────────────────────────────────────────────────────────────────────────────

export type ActivationState = 'active' | 'paused' | 'archived';

// ─────────────────────────────────────────────────────────────────────────────
// Core Files
// ─────────────────────────────────────────────────────────────────────────────

/** References to the agent's Core Files stored in the platform */
export interface CoreFilesRef {
  identityMd?: string; // storage key or inline content
  soulMd?: string;
  agentsMd?: string;
  toolsMd?: string;
  userMd?: string;
  heartbeatMd?: string;
  memoryMd?: string;
  bootstrapMd?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// IAgentProfile — Full Persistent Model
// ─────────────────────────────────────────────────────────────────────────────

export interface IAgentProfile {
  /** Primary key (UUIDv7) */
  id: string;

  // ── Hierarchy ──────────────────────────────────────────────────────────────
  workspaceId: string;
  departmentId: string;
  agencyId: string;
  /** SubAgent parent id — null for top-level agents */
  parentAgentId?: string | null;

  // ── Identity ───────────────────────────────────────────────────────────────
  name: string;
  title?: string;
  description?: string;
  avatarUrl?: string;

  // ── Role (CrewAI-inspired) ─────────────────────────────────────────────────
  /** The functional role: 'Senior Analyst', 'DevOps Engineer', etc. */
  role: string;
  /** One-sentence objective the agent must fulfil */
  goal: string;
  /** Narrative backstory that shapes reasoning style */
  backstory?: string;

  // ── LLM ───────────────────────────────────────────────────────────────────
  llm: LLMConfig;

  // ── Execution ─────────────────────────────────────────────────────────────
  executionLimits: ExecutionLimits;

  // ── Delegation ────────────────────────────────────────────────────────────
  delegation: DelegationConfig;

  // ── Memory ────────────────────────────────────────────────────────────────
  memory: MemoryConfig;

  // ── Tools & Skills ────────────────────────────────────────────────────────
  /** Tool ids registered in the ToolRegistry */
  toolIds: string[];
  /** Skill ids from the Skills Hub */
  skillIds?: string[];
  /** Declared capabilities (used for routing and Agent Card generation) */
  capabilities: AgentCapabilities;
  skills?: AgentSkill[];

  // ── Channels ──────────────────────────────────────────────────────────────
  channelBindings: ChannelBinding[];

  // ── Core Files ────────────────────────────────────────────────────────────
  coreFiles: CoreFilesRef;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  activationState: ActivationState;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;

  // ── Template origin ───────────────────────────────────────────────────────
  /** If spawned from a template */
  templateId?: string;
  templateVersion?: string;

  // ── Observability ─────────────────────────────────────────────────────────
  /** Custom tags for filtering in dashboards */
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO helpers
// ─────────────────────────────────────────────────────────────────────────────

export type CreateAgentProfileDto = Omit<
  IAgentProfile,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateAgentProfileDto = Partial<
  Omit<IAgentProfile, 'id' | 'agencyId' | 'departmentId' | 'workspaceId' | 'createdAt' | 'createdBy'>
>;
