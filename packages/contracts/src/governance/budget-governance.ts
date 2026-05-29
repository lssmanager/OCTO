/**
 * F0-010 — Paperclip Budget, Governance & Eval Contracts
 * Source of truth: ADR F0-010-paperclip-budget-governance-contracts.md
 *
 * Covers:
 *  - IBudgetPolicy, ICostTracking, BudgetCheckResult
 *  - IModelPolicy, IModelResolver
 *  - CostEvent
 *  - IGovernancePolicy
 *  - IApprovalFlow, ApprovalTicket
 *  - IEvalBundle, IEvalCase, IEvalRunner, ComparisonReport
 */

// ─────────────────────────────────────────────────────────────────────────────
// Budget Policy
// ─────────────────────────────────────────────────────────────────────────────

export type BudgetScope = 'per-run' | 'per-hour' | 'per-day' | 'per-month' | 'total';

export interface IBudgetPolicy {
  id: string;
  name: string;
  /** Hierarchy level this policy applies to */
  level: 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';
  ownerId: string;
  limits: {
    scope: BudgetScope;
    maxUsd?: number;
    maxTokens?: number;
    maxToolCalls?: number;
  }[];
  /** Action to take when a limit is exceeded */
  onExceeded: 'block' | 'warn' | 'require-approval' | 'auto-fallback';
  /** Fallback model when onExceeded === 'auto-fallback' */
  fallbackModel?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetCheckResult {
  allowed: boolean;
  remainingUsd?: number;
  remainingTokens?: number;
  /** Which policy triggered the decision */
  policyId: string;
  reason?: string;
  /** When action === 'require-approval', an approval request id is created */
  approvalRequestId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost Tracking
// ─────────────────────────────────────────────────────────────────────────────

export type CostEventType =
  | 'llm-call'
  | 'embedding'
  | 'tool-call'
  | 'mcp-call'
  | 'image-generation'
  | 'tts'
  | 'stt';

export interface CostEvent {
  id: string;
  runId: string;
  stepId?: string;
  agentId: string;
  workspaceId: string;
  departmentId: string;
  agencyId: string;
  type: CostEventType;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Computed cost in USD */
  costUsd: number;
  /** ISO 8601 */
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ICostTracking {
  /** Record a cost event */
  record(event: Omit<CostEvent, 'id' | 'timestamp'>): Promise<CostEvent>;
  /** Aggregate costs for a given scope */
  aggregate(filter: {
    agencyId?: string;
    departmentId?: string;
    workspaceId?: string;
    agentId?: string;
    runId?: string;
    from?: string; // ISO 8601
    to?: string; // ISO 8601
  }): Promise<{
    totalUsd: number;
    totalTokens: number;
    breakdown: Record<CostEventType, { usd: number; count: number }>;
  }>;
  /** Check if an operation is within budget before executing */
  checkBudget(params: {
    agentId: string;
    estimatedUsd?: number;
    estimatedTokens?: number;
  }): Promise<BudgetCheckResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Policy & Resolver
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelCapabilityMatrix {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  supportsStructuredOutput: boolean;
  contextWindowTokens: number;
  maxOutputTokens: number;
  /** Cost per 1M input tokens in USD */
  inputCostPer1MTokens: number;
  /** Cost per 1M output tokens in USD */
  outputCostPer1MTokens: number;
}

export interface IModelPolicy {
  id: string;
  name: string;
  /** Allowed model ids */
  allowedModels: string[];
  /** Blocked model ids — takes precedence over allowed */
  blockedModels?: string[];
  /** Ordered fallback chain */
  fallbackChain?: string[];
  /** Maximum cost per call in USD */
  maxCostPerCallUsd?: number;
  /** Required capabilities — model must satisfy all */
  requiredCapabilities?: Partial<ModelCapabilityMatrix>;
  level: 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';
  ownerId: string;
  enabled: boolean;
}

export interface IModelResolver {
  /** Resolve effective model for an agent considering hierarchy */
  resolve(agentId: string, preferredModel?: string): Promise<string>;
  /** Resolve full fallback chain */
  resolveFallbackChain(agentId: string): Promise<string[]>;
  /** Check if a model is allowed for a given agent */
  isAllowed(agentId: string, model: string): Promise<boolean>;
  /** Get capability matrix for a model */
  getCapabilities(model: string): Promise<ModelCapabilityMatrix>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance Policy
// ─────────────────────────────────────────────────────────────────────────────

export interface IGovernancePolicy {
  id: string;
  name: string;
  description?: string;
  level: 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';
  ownerId: string;
  rules: GovernanceRule[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type GovernanceRuleType =
  | 'max-delegation-depth'
  | 'require-approval-on-tool'
  | 'require-approval-on-budget-override'
  | 'block-tool'
  | 'block-model'
  | 'require-human-on-escalation'
  | 'audit-all-runs'
  | 'custom';

export interface GovernanceRule {
  type: GovernanceRuleType;
  /** Rule-specific parameters */
  params?: Record<string, unknown>;
  /** Action when rule is violated */
  onViolation: 'block' | 'warn' | 'require-approval' | 'audit';
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Flow
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalTicketStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated';

export interface ApprovalTicket {
  id: string;
  /** Flow definition id */
  flowId: string;
  runId: string;
  stepId?: string;
  agentId: string;
  title: string;
  description: string;
  /** Rich context payload for the reviewer */
  context: Record<string, unknown>;
  status: ApprovalTicketStatus;
  assignedTo?: string; // user id
  requestedBy: string;
  requestedAt: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: string;
  /** ISO 8601 expiry */
  expiresAt?: string;
  /** Escalation chain if auto-escalate is enabled */
  escalationChain?: string[];
  currentEscalationLevel?: number;
}

export interface IApprovalFlow {
  id: string;
  name: string;
  description?: string;
  /** Ordered list of reviewer user ids or role ids */
  reviewers: string[];
  /** Require all reviewers, or any single one */
  requireAll: boolean;
  /** Timeout in seconds before auto-action */
  timeoutSecs?: number;
  /** Action on timeout */
  onTimeout: 'approve' | 'reject' | 'escalate' | 'suspend';
  /** Escalation target user id */
  escalateTo?: string;
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evals
// ─────────────────────────────────────────────────────────────────────────────

export type EvalMetricType =
  | 'exact-match'
  | 'contains'
  | 'regex'
  | 'llm-judge'
  | 'json-schema'
  | 'custom';

export interface EvalMetric {
  type: EvalMetricType;
  /** Expected value for exact-match / contains / regex */
  expected?: unknown;
  /** JSON Schema for json-schema metric */
  schema?: object;
  /** LLM judge prompt template */
  judgePrompt?: string;
  /** Custom evaluator id */
  customEvaluatorId?: string;
  /** Weight (0–1) for composite scoring */
  weight?: number;
}

export interface IEvalCase {
  id: string;
  bundleId: string;
  name: string;
  description?: string;
  /** Input to the agent / flow under test */
  input: Record<string, unknown>;
  /** Ground truth or expected output */
  expectedOutput?: unknown;
  metrics: EvalMetric[];
  tags?: string[];
}

export interface IEvalBundle {
  id: string;
  name: string;
  description?: string;
  /** Agent or flow under evaluation */
  targetId: string;
  targetType: 'agent' | 'flow';
  cases: IEvalCase[];
  /** Model to use for llm-judge metrics */
  judgeModel?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type EvalCaseResult = {
  caseId: string;
  passed: boolean;
  score: number; // 0–1
  metricResults: Array<{
    metricType: EvalMetricType;
    passed: boolean;
    score: number;
    detail?: string;
  }>;
  actualOutput?: unknown;
  durationMs?: number;
  tokensUsed?: number;
  costUsd?: number;
  error?: string;
};

export interface EvalRunResult {
  runId: string;
  bundleId: string;
  /** ISO 8601 */
  startedAt: string;
  completedAt: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  overallScore: number; // 0–1
  caseResults: EvalCaseResult[];
  totalCostUsd: number;
  totalTokens: number;
}

export interface ComparisonReport {
  id: string;
  bundleId: string;
  /** The two run ids being compared */
  baselineRunId: string;
  candidateRunId: string;
  /** Score delta (candidate - baseline) */
  scoreDelta: number;
  costDelta: number;
  /** Cases where candidate regressed vs baseline */
  regressions: string[]; // caseIds
  /** Cases where candidate improved vs baseline */
  improvements: string[]; // caseIds
  /** ISO 8601 */
  generatedAt: string;
  summary?: string;
}

export interface IEvalRunner {
  run(bundle: IEvalBundle, options?: { parallelism?: number }): Promise<EvalRunResult>;
  compare(
    bundleId: string,
    baselineRunId: string,
    candidateRunId: string
  ): Promise<ComparisonReport>;
  getRunResult(runId: string): Promise<EvalRunResult | null>;
  listRunResults(bundleId: string): Promise<EvalRunResult[]>;
}
