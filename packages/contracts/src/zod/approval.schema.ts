import { z } from 'zod';

export const ApprovalKindSchema = z.enum([
  'tool_execution',
  'budget_override',
  'human_input',
  'external_validation',
]);

export const ApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);

export const ApprovalSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    executionId: z.string(),
    stepId: z.string(),
    kind: ApprovalKindSchema,
    status: ApprovalStatusSchema,
    title: z.string(),
    reason: z.string(),
    payloadJson: z.object({}).catchall(z.unknown()),
    timeoutAt: z.string().datetime().nullable().optional(),
    resolvedBy: z.string().nullable().optional(),
    resolvedAt: z.string().datetime().nullable().optional(),
    resolutionJson: z.object({}).catchall(z.unknown()).nullable().optional(),
  })
  .strict();

export type ApprovalKind = z.infer<typeof ApprovalKindSchema>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
