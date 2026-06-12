import { describe, expect, it } from 'vitest';
import { apiConfigSchema, JWT_SECRET_PLACEHOLDER } from '@octo/config';

const validConfig = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://octo:octo@localhost:5432/octo',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(32),
  LITELLM_MASTER_KEY: 'b'.repeat(16),
  INTERNAL_SECRET: 'c'.repeat(32),
};

describe('apiConfigSchema JWT hardening', () => {
  it('allows production JWT_SECRET fallback when JWT_SIGNING_KEYS is unset and the secret is strong', () => {
    const result = apiConfigSchema.safeParse({
      ...validConfig,
      JWT_SIGNING_KEYS: undefined,
    });

    expect(result.success).toBe(true);
  });

  it('rejects the published JWT_SECRET placeholder in production when JWT_SIGNING_KEYS is unset', () => {
    const result = apiConfigSchema.safeParse({
      ...validConfig,
      JWT_SECRET: JWT_SECRET_PLACEHOLDER,
      JWT_SIGNING_KEYS: undefined,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['JWT_SECRET'],
          message: expect.stringContaining('JWT_SECRET placeholder must be replaced'),
        }),
      ])
    );
  });

  it('allows production config when JWT_SIGNING_KEYS is present because the fallback is inactive', () => {
    const result = apiConfigSchema.safeParse({
      ...validConfig,
      JWT_SECRET: JWT_SECRET_PLACEHOLDER,
      JWT_SIGNING_KEYS:
        '[{"kid":"api-rs256","algorithm":"RS256","isActive":true,"publicKey":"public"}]',
    });

    expect(result.success).toBe(true);
  });
});
