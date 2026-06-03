import { z } from 'zod';

const JsonObjectSchema = z.object({}).catchall(z.unknown());

export const CanonicalChatMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export const CanonicalChatContentPartSchema = JsonObjectSchema;

export const CanonicalChatMessageSchema = z
  .object({
    role: CanonicalChatMessageRoleSchema,
    content: z.union([z.string(), z.array(CanonicalChatContentPartSchema)]),
    name: z.string().nullable().optional(),
    toolCallId: z.string().nullable().optional(),
  })
  .strict();

export const CanonicalToolDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    inputSchema: JsonObjectSchema,
  })
  .strict();

export const PromptCachePolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    strategy: z.enum(['none', 'provider', 'semantic', 'provider_then_semantic']).default('none'),
    cacheKey: z.string().nullable().optional(),
    providerBreakpoints: z.array(z.number().int()).nullable().optional(),
    semanticSimilarityThreshold: z.number().default(0.92),
    ttlSeconds: z.number().int().nullable().optional(),
  })
  .strict();

export const ChatCompletionRequestSchema = z
  .object({
    tenantId: z.string(),
    executionId: z.string(),
    agentId: z.string(),
    model: z.string(),
    messages: z.array(CanonicalChatMessageSchema),
    temperature: z.number().default(0.2),
    maxOutputTokens: z.number().int().default(2048),
    stream: z.boolean().default(false),
    timeoutMs: z.number().int().default(90_000),
    tools: z.array(CanonicalToolDefinitionSchema).nullable().optional(),
    toolChoice: z.enum(['none', 'auto', 'required']).default('auto'),
    providerParams: JsonObjectSchema.nullable().optional(),
    metadata: z.record(z.string(), z.string()).nullable().optional(),
    promptCache: PromptCachePolicySchema.nullable().optional(),
    reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).default('none'),
    outputSchema: JsonObjectSchema.nullable().optional(),
    routingStrategy: z
      .enum(['default', 'least-busy', 'latency-based', 'cost-based'])
      .default('default'),
  })
  .strict();

export const ChatUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).default(0),
    outputTokens: z.number().int().min(0).default(0),
    totalTokens: z.number().int().min(0).default(0),
    reasoningTokens: z.number().int().min(0).default(0),
    cachedInputTokens: z.number().int().min(0).default(0),
    provider: z.string(),
    model: z.string(),
    estimatedCostUsd: z.string().regex(/^\d+(\.\d+)?$/),
  })
  .strict();

export const ChatCompletionResponseSchema = z
  .object({
    id: z.string(),
    content: z.string(),
    toolCalls: z.array(JsonObjectSchema).nullable().optional(),
    finishReason: z.enum(['stop', 'tool_calls', 'length', 'content_filter', 'error']),
    usage: ChatUsageSchema,
    raw: JsonObjectSchema,
  })
  .strict();

export type CanonicalChatMessage = z.infer<typeof CanonicalChatMessageSchema>;
export type CanonicalToolDefinition = z.infer<typeof CanonicalToolDefinitionSchema>;
export type PromptCachePolicy = z.infer<typeof PromptCachePolicySchema>;
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
export type ChatUsage = z.infer<typeof ChatUsageSchema>;
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
