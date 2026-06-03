import { z } from 'zod';

export const ExecutionContextSchema = z
  .object({
    parentExecutionId: z.string().nullable().optional(),
    delegationChain: z.array(z.string()),
    memoryScope: z.string(),
    variables: z.object({}).catchall(z.unknown()),
  })
  .strict();

export type ZodExecutionContext = z.infer<typeof ExecutionContextSchema>;
