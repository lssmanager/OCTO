import { z } from 'zod';

export const AgentStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'DRAFT']);

export const ModelPolicySchema = z.object({
  primaryModel: z.string(),
  fallbackModels: z.array(z.string()).default([]),
  temperature: z.number().min(0).max(2).default(0.2),
  maxOutputTokens: z.number().int().default(2048),
});

export const ToolPolicySchema = z.object({
  allow: z.array(z.string()),
  deny: z.array(z.string()).default([]),
  requireApprovalFor: z.array(z.string()).default([]),
});

export const BudgetPolicySchema = z.object({
  maxUsdPerRun: z.string().regex(/^\d+\.\d{2}$/),
  maxUsdPerDay: z.string().regex(/^\d+\.\d{2}$/),
  hardStop: z.boolean().default(true),
});

export const AgentConfigSchema = z.object({
  name: z.string().min(1).max(200),
  instructions: z.string(),
  workspaceId: z.string(),
  modelPolicy: ModelPolicySchema,
  toolPolicy: ToolPolicySchema,
  budgetPolicy: BudgetPolicySchema,
  executionTimeoutMs: z.number().int().default(900000),
});

export const AgentVersionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  agentId: z.string(),
  version: z.number().int(),
  configJson: AgentConfigSchema,
  createdAt: z.string().datetime(),
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type ModelPolicy = z.infer<typeof ModelPolicySchema>;
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;
export type BudgetPolicy = z.infer<typeof BudgetPolicySchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentVersion = z.infer<typeof AgentVersionSchema>;
