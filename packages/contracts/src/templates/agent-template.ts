/**
 * F0-011 — agency-agents Template Format / IAgentTemplate
 * Source of truth: ADR F0-011-agency-agents-template-format.md
 *
 * Covers:
 *  - IAgentTemplate — full contract
 *  - TemplateCategory — Templates Hub categories
 *  - TemplateMetadata — Markdown section metadata
 *  - sourceUrl / lastSyncedAt / isReadonly — traceability
 *  - ITemplateSyncConfig — import/sync flow from external repo
 *  - ITemplateHubService — query and import interface
 */

import type { LLMConfig, ExecutionLimits, MemoryConfig, ChannelBinding } from '../agents/agent-profile';
import type { AgentCapabilities, AgentSkill } from '../protocols/mcp-a2a';

// ─────────────────────────────────────────────────────────────────────────────
// Template Categories (Templates Hub)
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateCategory =
  | 'engineering'
  | 'product'
  | 'design'
  | 'growth'
  | 'sales'
  | 'support'
  | 'finance'
  | 'legal'
  | 'operations'
  | 'research'
  | 'security'
  | 'devops'
  | 'data'
  | 'marketing'
  | 'hr'
  | 'executive'
  | 'coordinator'
  | 'specialist'
  | 'custom';

// ─────────────────────────────────────────────────────────────────────────────
// Core File Templates
// ─────────────────────────────────────────────────────────────────────────────

export interface CoreFileTemplates {
  /** Markdown content for IDENTITY.md */
  identityMd?: string;
  /** Markdown content for SOUL.md */
  soulMd?: string;
  /** Markdown content for AGENTS.md — skills, team, collaboration style */
  agentsMd?: string;
  /** Markdown content for TOOLS.md — declared tool usage */
  toolsMd?: string;
  /** Markdown content for HEARTBEAT.md — routines & autonomous tasks */
  heartbeatMd?: string;
  /** Markdown content for MEMORY.md — memory scope & retention */
  memoryMd?: string;
  /** Markdown content for BOOTSTRAP.md — startup instructions */
  bootstrapMd?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Metadata (Markdown front-matter equivalent)
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateMetadata {
  /** Human-readable template name */
  name: string;
  /** Short one-liner description */
  description: string;
  /** Markdown long-form description shown in Templates Hub detail view */
  longDescription?: string;
  /** Template version (semver) */
  version: string;
  /** Author or team that created the template */
  author?: string;
  category: TemplateCategory;
  /** Flat tag list for search/filtering */
  tags: string[];
  /** URL to template preview image */
  previewImageUrl?: string;
  /** Recommended hierarchy level for instantiation */
  recommendedLevel?: 'agency' | 'department' | 'workspace' | 'agent' | 'sub-agent';
  /** Declared tool slugs required by this template */
  requiredToolSlugs?: string[];
  /** Declared skill slugs required by this template */
  requiredSkillSlugs?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// IAgentTemplate — Full Contract
// ─────────────────────────────────────────────────────────────────────────────

export interface IAgentTemplate {
  /** Primary key (UUIDv7) */
  id: string;

  // ── Metadata ───────────────────────────────────────────────────────────────
  metadata: TemplateMetadata;

  // ── Agent defaults ─────────────────────────────────────────────────────────
  /** Default role string used when instantiating the agent */
  defaultRole: string;
  /** Default goal string */
  defaultGoal: string;
  /** Default backstory */
  defaultBackstory?: string;

  // ── LLM defaults ───────────────────────────────────────────────────────────
  defaultLlm?: Partial<LLMConfig>;

  // ── Limits ─────────────────────────────────────────────────────────────────
  defaultExecutionLimits?: Partial<ExecutionLimits>;

  // ── Memory ─────────────────────────────────────────────────────────────────
  defaultMemory?: Partial<MemoryConfig>;

  // ── Capabilities ───────────────────────────────────────────────────────────
  capabilities?: AgentCapabilities;
  skills?: AgentSkill[];

  // ── Default Tools & Skills ─────────────────────────────────────────────────
  defaultToolIds?: string[];
  defaultSkillIds?: string[];

  // ── Channel Defaults ───────────────────────────────────────────────────────
  defaultChannelBindings?: ChannelBinding[];

  // ── Core Files ─────────────────────────────────────────────────────────────
  coreFiles: CoreFileTemplates;

  // ── Traceability ───────────────────────────────────────────────────────────
  /**
   * URL to the source file in the external repo (e.g. agency-agents on GitHub).
   * Used for syncing and attributing origin.
   */
  sourceUrl?: string;
  /**
   * Last time this template was synced from the external source.
   * Null if it was created locally.
   */
  lastSyncedAt?: Date | null;
  /**
   * When true, the template originates from an external repo and must not
   * be edited locally. Edits require forking to a new custom template.
   */
  isReadonly: boolean;
  /** Git commit SHA at time of last sync */
  sourceCommitSha?: string;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  /** Whether this template is visible in the Templates Hub */
  isPublished: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Config
// ─────────────────────────────────────────────────────────────────────────────

export interface ITemplateSyncConfig {
  id: string;
  /** Remote repo URL (e.g. https://github.com/lssmanager/agency-agents) */
  repoUrl: string;
  /** Branch to sync from */
  branch: string;
  /** Glob pattern for template files (e.g. 'agents/**/*.md') */
  filePattern: string;
  /** Cron expression for automatic sync (null = manual only) */
  cronExpression?: string | null;
  /** GitHub PAT or installation token stored in vault */
  credentialRef?: string;
  lastSyncedAt?: Date | null;
  lastSyncStatus?: 'success' | 'failure' | 'in-progress';
  lastSyncError?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateSyncResult {
  syncConfigId: string;
  /** ISO 8601 */
  startedAt: string;
  completedAt: string;
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ file: string; error: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Hub Service
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateListFilter {
  category?: TemplateCategory;
  tags?: string[];
  search?: string;
  isReadonly?: boolean;
  isPublished?: boolean;
  recommendedLevel?: IAgentTemplate['metadata']['recommendedLevel'];
}

export interface ITemplateHubService {
  /** List templates with optional filters */
  list(filter?: TemplateListFilter): Promise<IAgentTemplate[]>;
  /** Get a single template by id */
  get(id: string): Promise<IAgentTemplate | null>;
  /** Import a template from an external URL */
  importFromUrl(url: string, syncConfigId?: string): Promise<IAgentTemplate>;
  /** Trigger a manual sync for a sync config */
  sync(syncConfigId: string): Promise<TemplateSyncResult>;
  /**
   * Fork a readonly template into a new editable local copy.
   * The fork loses sourceUrl and isReadonly becomes false.
   */
  fork(templateId: string, overrides?: Partial<TemplateMetadata>): Promise<IAgentTemplate>;
  /** Instantiate a template into a concrete IAgentProfile */
  instantiate(
    templateId: string,
    target: { workspaceId: string; departmentId: string; agencyId: string; createdBy: string },
    overrides?: Record<string, unknown>,
  ): Promise<{ agentProfileId: string }>;
}
