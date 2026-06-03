import { z } from 'zod';
import { ToolKindSchema } from './tool-invocation.schema';

const JsonObjectSchema = z.object({}).catchall(z.unknown());

export const SideEffectLevelSchema = z.enum(['none', 'low', 'high']);
export const ToolStatusSchema = z.enum([
  'DISCOVERED',
  'PENDING_REVIEW',
  'APPROVED',
  'ENABLED',
  'DISABLED',
  'DEPRECATED',
  'REVOKED',
  'NEEDS_REVIEW',
]);
export const ApprovalPolicySchema = z.enum(['never_require', 'always_require', 'policy_based']);
export const ToolNetworkPolicySchema = z.enum(['none', 'egress_allowlist', 'mcp_http_only']);

export const ToolDefinitionSchema = z
  .object({
    name: z.string().min(1),
    kind: ToolKindSchema,
    description: z.string().min(1),
    inputSchema: JsonObjectSchema,
    outputSchema: JsonObjectSchema,
    timeoutMs: z.number().int().positive().default(30_000),
    retryable: z.boolean().default(false),
    sideEffectLevel: SideEffectLevelSchema.default('none'),
    approvalPolicy: ApprovalPolicySchema.default('policy_based'),
    requiresApproval: z.boolean().default(false),
    tenantScoped: z.boolean().default(true),
    allowedRoles: z.array(z.string()).default([]),
    allowedScopes: z.array(z.string()).default([]),
    sandboxProfile: z.string().default('builtin-default'),
    networkPolicy: ToolNetworkPolicySchema.default('none'),
    egressAllowlist: z.array(z.string()).default([]),
    compensationAction: z.string().nullable().optional(),
    nonCompensatable: z.boolean().default(false),
    source: z.enum(['builtin', 'mcp', 'hub', 'custom']).default('builtin'),
    sourceRef: z.string().nullable().optional(),
    descriptorHash: z.string().nullable().optional(),
    version: z.number().int().min(1).default(1),
    status: ToolStatusSchema.default('ENABLED'),
    enabled: z.boolean().default(true),
  })
  .strict();

export const ToolExecutionModeSchema = z.enum(['sync', 'async']);
export const ToolExecutionStatusSchema = z.enum([
  'PENDING',
  'VALIDATED',
  'AUTHORIZED',
  'APPROVAL_REQUIRED',
  'RUNNING',
  'PENDING_ASYNC',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
]);

export const ToolExecutionRequestSchema = z
  .object({
    toolName: z.string(),
    argumentsJson: JsonObjectSchema,
    rawToolCallId: z.string().nullable().optional(),
    executionMode: ToolExecutionModeSchema.default('sync'),
  })
  .strict();

export const ToolExecutionResultSchema = z
  .object({
    status: ToolExecutionStatusSchema,
    resultJson: JsonObjectSchema.nullable().optional(),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    retryable: z.boolean().default(false),
    stdout: z.string().nullable().optional(),
    stderr: z.string().nullable().optional(),
    exitCode: z.number().int().nullable().optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    durationMs: z.number().int().nullable().optional(),
    outputSchemaValid: z.boolean().default(false),
    sanitized: z.boolean().default(true),
  })
  .strict();

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolExecutionRequest = z.infer<typeof ToolExecutionRequestSchema>;
export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;
