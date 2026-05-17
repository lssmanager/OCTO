/**
 * F0-006 — MCP & A2A Protocol Contracts
 * Source of truth: ADR F0-006-mcp-a2a-protocol-contracts.md
 *
 * Covers:
 *  - MCP (Model Context Protocol) — MCPClient, MCPServer, MCPTool, MCPServerConfig
 *  - A2A (Agent-to-Agent) — AgentCard, A2AClient, A2AMessageEnvelope, A2ATaskRef
 *  - Agent Registry — AgentRegistration
 *  - HITL / Approval — ApprovalRequest, ApprovalService
 *  - Canonical Message — AgentMessage, ConversationEntry, ContentPart
 *  - Declarative Manifests — AgentManifest, WorkflowManifest
 */

import type { JSONSchema7 } from 'json-schema';

// ─────────────────────────────────────────────────────────────────────────────
// 1. MCP — Model Context Protocol
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  outputSchema?: JSONSchema7;
  /** Approval policy inherited or overridden at tool level */
  approvalPolicy?: 'always-require' | 'never-require' | 'policy-based';
  call(args: unknown): Promise<unknown>;
}

export interface MCPServerConfig {
  transport: 'stdio' | 'http' | 'sse';
  /** Required for http/sse transport */
  url?: string;
  /** Required for stdio transport */
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  approvalPolicy?: 'always-require' | 'never-require' | 'policy-based';
  /** Optional timeout in ms */
  timeoutMs?: number;
}

export interface MCPClient {
  connect(serverConfig: MCPServerConfig): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: unknown): Promise<unknown>;
}

export interface MCPServer {
  registerTool(tool: MCPTool): void;
  unregisterTool(name: string): void;
  listTools(): MCPTool[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. A2A — Agent-to-Agent Protocol
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentCapabilities {
  streaming?: boolean;
  stateTransitionHistory?: boolean;
  pushNotifications?: boolean;
  humanInTheLoop?: boolean;
  artifacts?: boolean;
  structuredOutput?: boolean;
  mcpClient?: boolean;
  a2aServer?: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  /** Base URL exposing the A2A endpoint */
  endpoint: string;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  capabilities: AgentCapabilities;
  skills?: AgentSkill[];
  security: {
    scheme: 'bearer' | 'basic' | 'none';
    credentials?: unknown;
  };
  metadata?: Record<string, unknown>;
}

export type A2ATaskStatus =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface A2ATaskRef {
  id: string;
  contextId: string;
  status: A2ATaskStatus;
  artifacts?: Array<{
    id: string;
    name?: string;
    mediaType?: string;
  }>;
  history?: A2AMessageEnvelope[];
}

export type ContentPartType =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text?: string; redacted?: boolean }
  | { type: 'tool-call'; callId: string; name: string; arguments?: Record<string, unknown> }
  | { type: 'tool-result'; callId: string; result?: unknown; isError?: boolean }
  | { type: 'error'; code?: string; message?: string; details?: unknown }
  | { type: 'data'; uri: string; mediaType?: string }
  | { type: 'uri'; uri: string; mediaType: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: 'artifact-ref'; artifactId: string; mediaType?: string }
  | { type: 'unknown'; raw: unknown };

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'agent';

export interface A2AMessageEnvelope {
  id: string;
  contextId: string;
  role: MessageRole;
  parts: ContentPartType[];
  metadata?: Record<string, unknown>;
}

export interface A2ATaskRequest {
  contextId?: string;
  message: A2AMessageEnvelope;
  metadata?: Record<string, unknown>;
}

export interface HandoffTool {
  name: string;
  targetAgentId: string;
  invoke(context: ExecutionContext): Promise<HandoffResult>;
}

export interface HandoffResult {
  accepted: boolean;
  targetRunId?: string;
  reason?: string;
}

/** Minimal ExecutionContext reference — expanded in execution contracts */
export interface ExecutionContext {
  runId: string;
  agentId: string;
  workspaceId: string;
  traceId: string;
}

export interface A2AClient {
  getAgentCard(agentBaseUrl: string): Promise<AgentCard>;
  sendMessage(agentUrl: string, message: A2AMessageEnvelope): Promise<A2AMessageEnvelope>;
  createTask(agentUrl: string, task: A2ATaskRequest): Promise<A2ATaskRef>;
  getTaskStatus(agentUrl: string, taskId: string): Promise<A2ATaskRef>;
  cancelTask(agentUrl: string, taskId: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Agent Registry
// ─────────────────────────────────────────────────────────────────────────────

export type AgentLevel = 'Agency' | 'Department' | 'Workspace' | 'Agent' | 'SubAgent';
export type AgentStatus = 'active' | 'paused' | 'archived';
export type AgentVisibility = 'public' | 'private' | 'restricted';

export interface AgentRegistration {
  agentId: string;
  levelId: string; // FK to hierarchy node
  level: AgentLevel;
  agentCard: AgentCard;
  operational: {
    endpoint?: string;
    status: AgentStatus;
    lastSeen?: Date;
  };
  createdBy: string;
  visibility: AgentVisibility;
  /** For restricted visibility: explicit allowlist of agentIds */
  allowlist?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HITL — Durable Approval Contract
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalKind =
  | 'tool-call'
  | 'mcp-tool-call'
  | 'agent-handoff'
  | 'budget-override'
  | 'external-message-release'
  | 'workflow-transition'
  | 'escalation-request';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'canceled';

export interface ApprovalRequest {
  id: string;
  runId: string;
  stepId: string;
  agentId: string;
  kind: ApprovalKind;
  title: string;
  reason: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionComment?: string;
  timeoutAt?: string; // ISO 8601
  decisionMetadata?: Record<string, unknown>;
}

export interface ApprovalService {
  requestApproval(
    request: Omit<ApprovalRequest, 'id' | 'status' | 'requestedAt'>,
  ): Promise<ApprovalRequest>;
  resolveApproval(
    id: string,
    decision: 'approve' | 'reject',
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  getPendingApprovals(filter?: {
    runId?: string;
    agentId?: string;
    kind?: ApprovalKind;
  }): Promise<ApprovalRequest[]>;
  getApproval(id: string): Promise<ApprovalRequest | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Canonical Message Contract
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  runId?: string;
  stepId?: string;
  authorName?: string;
  role: MessageRole;
  parts: ContentPartType[];
  createdAt: string; // RFC 3339
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationEntry {
  id: string;
  correlationId?: string;
  createdAt: string; // RFC 3339
  messages: AgentMessage[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Declarative Agent & Workflow Manifests
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentManifestBudget {
  maxUsdPerRun?: number;
  maxTokensPerRun?: number;
  maxDelegationDepth?: number;
  policyRef?: string;
}

export interface AgentManifestHeartbeat {
  cron: string;
  task: string;
}

export interface AgentManifest {
  kind: 'Agent';
  apiVersion: string;
  metadata: {
    name: string;
    title?: string;
    description?: string;
  };
  spec: {
    extends?: string;
    instructions: {
      files?: string[]; // e.g. ['IDENTITY.md', 'SOUL.md']
      inline?: string;
    };
    tools?: Array<{ ref: string; source?: string }>;
    model?: {
      policyRef?: string;
      primary?: string;
      fallback?: string[];
    };
    budget?: AgentManifestBudget;
    capabilities?: AgentCapabilities;
    heartbeat?: AgentManifestHeartbeat[];
  };
}

export type WorkflowStepKind =
  | 'Agent'
  | 'Condition'
  | 'Approval'
  | 'SetVariable'
  | 'GotoAction'
  | 'CreateConversation'
  | 'End';

export interface WorkflowStep {
  kind: WorkflowStepKind;
  id: string;
  agent?: string;
  output?: { saveAs?: string };
  input?: { arguments?: Record<string, unknown> };
  when?: string;
  then?: WorkflowStep[];
  else?: WorkflowStep[];
  title?: string;
  reason?: string;
  variable?: string;
  value?: unknown;
  target?: string;
}

export interface WorkflowManifest {
  kind: 'Workflow';
  apiVersion: string;
  metadata: {
    name: string;
    description?: string;
  };
  spec: {
    trigger?: {
      kind: string;
      maxTurns?: number;
    };
    steps: WorkflowStep[];
  };
}
