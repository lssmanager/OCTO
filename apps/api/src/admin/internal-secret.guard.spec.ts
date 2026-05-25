import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { InternalSecretGuard } from './internal-secret.guard';

describe('InternalSecretGuard', () => {
  it('rejects request without x-internal-secret even in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_SECRET = 'super-secure-secret-value-1234567890';
    delete process.env.ALLOW_INSECURE_INTERNAL_SECRET_BYPASS;

    const guard = new InternalSecretGuard(new Reflector());
    const req: any = { headers: {} };
    const ctx: any = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => req }) };

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
