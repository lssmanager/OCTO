import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InternalSecretGuard } from './internal-secret.guard';

describe('InternalSecretGuard', () => {
  const makeContext = (header?: string): ExecutionContext => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ headers: header ? { 'x-internal-secret': header } : {} }) }),
  } as unknown as ExecutionContext);

  it('rejects missing header even in development mode', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_INSECURE_INTERNAL_SECRET_BYPASS;
    process.env.INTERNAL_SECRET = 's3cr3t';

    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    const guard = new InternalSecretGuard(reflector);

    expect(() => guard.canActivate(makeContext())).toThrow('Missing or invalid X-Internal-Secret header');
  });
});
