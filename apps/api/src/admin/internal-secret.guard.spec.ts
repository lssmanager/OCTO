import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { apiConfigSchema } from '@octo/config';
import { InternalSecretGuard } from './internal-secret.guard';

const VALID_SECRET = 'internal-secret-for-tests-minimum-32-chars';

function reflector(isPublic = false) {
  return {
    getAllAndOverride: () => isPublic,
  };
}

function contextWithSecret(secret?: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: secret ? { 'x-internal-secret': secret } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('InternalSecretGuard fail-closed configuration', () => {
  const originalInternalSecret = process.env['INTERNAL_SECRET'];
  const originalNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalInternalSecret === undefined) {
      delete process.env['INTERNAL_SECRET'];
    } else {
      process.env['INTERNAL_SECRET'] = originalInternalSecret;
    }

    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
  });

  it('fails at construction when INTERNAL_SECRET is missing, even in development', () => {
    delete process.env['INTERNAL_SECRET'];
    process.env['NODE_ENV'] = 'development';

    expect(() => new InternalSecretGuard(reflector() as any)).toThrow(/INTERNAL_SECRET/);
  });

  it('does not bypass protected routes based on NODE_ENV=development', () => {
    process.env['INTERNAL_SECRET'] = VALID_SECRET;
    process.env['NODE_ENV'] = 'development';

    const guard = new InternalSecretGuard(reflector() as any);

    expect(() => guard.canActivate(contextWithSecret())).toThrow(UnauthorizedException);
  });

  it('allows protected routes only with the canonical x-internal-secret value', () => {
    process.env['INTERNAL_SECRET'] = VALID_SECRET;

    const guard = new InternalSecretGuard(reflector() as any);

    expect(guard.canActivate(contextWithSecret(VALID_SECRET))).toBe(true);
    expect(() => guard.canActivate(contextWithSecret('wrong-secret'))).toThrow(
      UnauthorizedException
    );
  });

  it('keeps @Public routes public after startup configuration is valid', () => {
    process.env['INTERNAL_SECRET'] = VALID_SECRET;

    const guard = new InternalSecretGuard(reflector(true) as any);

    expect(guard.canActivate(contextWithSecret())).toBe(true);
  });
});

describe('API config internal secret contract', () => {
  it('requires INTERNAL_SECRET and rejects legacy parallel secret names', () => {
    const baseEnv = {
      NODE_ENV: 'production',
      PORT: '3001',
      DATABASE_URL: 'postgresql://octo:octo@localhost:5432/octo',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'jwt-secret-for-tests-minimum-32-chars',
      JWT_SIGNING_KEYS:
        '[{"kid":"test-key","algorithm":"HS256","secret":"jwt-secret-for-tests-minimum-32-chars","isActive":true}]',
      LITELLM_MASTER_KEY: 'litellm-key-for-tests',
      RUNTIME_WORKER_URL: 'http://runtime-worker:8000',
    };

    expect(
      apiConfigSchema.safeParse({ ...baseEnv, RUNTIME_API_SECRET: VALID_SECRET }).success
    ).toBe(false);
    expect(
      apiConfigSchema.safeParse({ ...baseEnv, API_INTERNAL_SECRET: VALID_SECRET }).success
    ).toBe(false);
    expect(apiConfigSchema.safeParse({ ...baseEnv, INTERNAL_SECRET: VALID_SECRET }).success).toBe(
      true
    );
  });
});

describe('deploy config internal secret drift checks', () => {
  const repoRoot = resolve(__dirname, '../../../..');
  const checkedFiles = [
    '.env.example',
    'docker-compose.yml',
    'docker-compose.f1.yml',
    'scripts/f1-runtime-handoff-smoke.sh',
    'scripts/f1-verify.sh',
  ];

  it('uses only INTERNAL_SECRET in deployable config and smoke checks', () => {
    for (const file of checkedFiles) {
      const content = readFileSync(resolve(repoRoot, file), 'utf8');
      expect(content).toContain('INTERNAL_SECRET');
      expect(content).not.toContain('RUNTIME_API_SECRET');
      expect(content).not.toContain('API_INTERNAL_SECRET');
    }
  });

  it('does not advertise NODE_ENV=development in the deployable env template', () => {
    const content = readFileSync(resolve(repoRoot, '.env.example'), 'utf8');

    expect(content).toContain('NODE_ENV=production');
    expect(content).not.toContain('NODE_ENV=development');
  });
});
