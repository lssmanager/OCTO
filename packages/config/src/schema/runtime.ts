import { z } from 'zod';

const postgresUrlRefine = (v: string) =>
  v.startsWith('postgresql://') || v.startsWith('postgres://');

const postgresUrlMessage = 'DATABASE_URL must start with postgresql:// or postgres://';

/**
 * Zod schema for the Python runtime-worker environment.
 * Used as the TypeScript source-of-truth for runtime config documentation.
 * The actual validation in Python uses pydantic-settings (config.py).
 */
export const runtimeConfigSchema = z.object({
  DATABASE_URL: z.string().url().refine(postgresUrlRefine, { message: postgresUrlMessage }),
  REDIS_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('redis://'), {
      message: 'REDIS_URL must start with redis://',
    }),
  LITELLM_BASE_URL: z.string().url().default('http://litellm:4000'),
  API_SECRET: z.string().min(32, 'API_SECRET must be at least 32 characters'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://otel-collector:4318'),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR']).default('INFO'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  MAX_EXECUTION_TIMEOUT_MS: z.coerce.number().int().default(300_000),
  BUILD_VERSION: z.string().default('0.0.1-f0'),
  BUILD_COMMIT: z.string().default('unknown'),
  BUILD_PHASE: z.string().default('F0'),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
