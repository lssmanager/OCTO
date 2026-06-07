import { z } from 'zod';

const postgresUrlRefine = (v: string) =>
  v.startsWith('postgresql://') || v.startsWith('postgres://');

const postgresUrlMessage = 'DATABASE_URL must start with postgresql:// or postgres://';

export const apiConfigSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DATABASE_URL: z.string().url().refine(postgresUrlRefine, { message: postgresUrlMessage }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

  // Redis
  REDIS_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('redis://'), {
      message: 'REDIS_URL must start with redis://',
    }),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_SIGNING_KEYS: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // LiteLLM
  LITELLM_BASE_URL: z.string().url().default('http://litellm:4000'),
  LITELLM_MASTER_KEY: z.string().min(16, 'LITELLM_MASTER_KEY must be at least 16 characters'),

  // Internal/admin and inter-service authentication
  RUNTIME_WORKER_URL: z.string().url().default('http://runtime-worker:8000'),
  INTERNAL_SECRET: z.string().min(32, 'INTERNAL_SECRET must be at least 32 characters'),

  // OTEL
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://otel-collector:4318'),
  OTEL_SERVICE_NAME: z.string().default('octo-api'),

  // CORS — comma-separated origins, e.g. "http://localhost:3000,https://app.octo.ai"
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Build info — injected by CI, safe defaults for local
  BUILD_VERSION: z.string().default('0.1.0-f1'),
  BUILD_COMMIT: z.string().default('local'),
  BUILD_PHASE: z.string().default('F1'),
  BUILD_TIME: z.string().default('local'),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

/**
 * Validates process.env against the API config schema.
 *
 * FAILS FAST on startup: prints every invalid variable and exits with code 1.
 * Call once at module load — never inside request handlers.
 *
 * Replicates the n8n fail-fast pattern (F0-016-env-config-strategy.md).
 */
export function loadApiConfig(): ApiConfig {
  const result = apiConfigSchema.safeParse(process.env);

  if (!result.success) {
    console.error('\n\u274c Invalid environment configuration:\n');
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\nFix these variables before starting the service.');
    console.error('Tip: copy .env.example to .env and fill in real values.\n');
    process.exit(1);
  }

  return result.data;
}
