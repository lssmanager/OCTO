import { z } from 'zod';

export const ToolKindSchema = z.enum(['builtin_sync', 'builtin_async', 'mcp_stdio', 'mcp_http']);

export const ToolInvocationStatusSchema = z.enum([
  'PENDING',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'PENDING_ASYNC',
  'CANCELLED',
]);

export const ToolInvocationSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  executionId: z.string(),
  stepId: z.string(),
  toolName: z.string(),
  toolKind: ToolKindSchema,
  status: ToolInvocationStatusSchema,
  argsJson: z.record(z.string(), z.unknown()),
  resultJson: z.record(z.string(), z.unknown()).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  requiresApproval: z.boolean(),
  approvalId: z.string().nullable().optional(),
  idempotencyKey: z.string(),
  durationMs: z.number().int().nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
});

export type ToolKind = z.infer<typeof ToolKindSchema>;
export type ToolInvocationStatus = z.infer<typeof ToolInvocationStatusSchema>;
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;
