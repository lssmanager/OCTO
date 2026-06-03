import { z } from 'zod';

export const AgentStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'DRAFT']);

export const ModelPolicySchema = z
  .object({
    primaryModel: z.string(),
    fallbackModels: z.array(z.string()).default([]),
    fallbackChain: z.array(z.string()).default([]),
    allowedModels: z.array(z.string()).default([]),
    registeredModels: z.array(z.string()).default([]),
    temperature: z.number().min(0).max(2).default(0.2),
    maxOutputTokens: z.number().int().default(2048),
  })
  .strict();

export const ToolPolicySchema = z
  .object({
    allow: z.array(z.string()),
    deny: z.array(z.string()).default([]),
    requireApprovalFor: z.array(z.string()).default([]),
  })
  .strict();

export const BudgetPolicySchema = z
  .object({
    maxUsdPerRun: z.string().regex(/^\d+\.\d{2}$/),
    maxUsdPerDay: z.string().regex(/^\d+\.\d{2}$/),
    minReservedCostUsd: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .default('0.000001'),
    currentSpendUsd: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .default('0'),
    onExhaust: z.enum(['fail', 'block', 'warn', 'require_approval']).default('fail'),
    hardStop: z.boolean().default(true),
  })
  .strict();

export const AgentConfigSchema = z
  .object({
    name: z.string().min(1).max(200),
    instructions: z.string(),
    workspaceId: z.string(),
    modelPolicy: ModelPolicySchema,
    toolPolicy: ToolPolicySchema,
    budgetPolicy: BudgetPolicySchema,
    executionTimeoutMs: z.number().int().default(900000),
  })
  .strict();

export const AgentVersionSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    agentId: z.string(),
    version: z.number().int(),
    configJson: AgentConfigSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type ModelPolicy = z.infer<typeof ModelPolicySchema>;
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;
export type BudgetPolicy = z.infer<typeof BudgetPolicySchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentVersion = z.infer<typeof AgentVersionSchema>;
