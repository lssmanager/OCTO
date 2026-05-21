// packages/security/src/security.module.ts
// F0: SecurityModule — minimum viable NestJS security.
//
// Registers InternalSecretGuard as APP_GUARD (global).
//
// useExisting (not useClass) for APP_GUARD: this tells NestJS to reuse
// the InternalSecretGuard instance already resolved by the DI container
// for the InternalSecretGuard provider above it. useClass would create a
// second independent instance in the root module scope, where constructor
// injection of Reflector silently fails, leaving this.reflector undefined
// and causing:
//   TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')
//
// AppModule only needs to import SecurityModule — no APP_GUARD there.

import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InternalSecretGuard, Public } from './internal-secret.guard';

@Global()
@Module({
  providers: [
    InternalSecretGuard,
    {
      provide: APP_GUARD,
      useExisting: InternalSecretGuard,
    },
  ],
  exports: [InternalSecretGuard],
})
export class SecurityModule {}

// Re-export decorator for convenience
export { Public, InternalSecretGuard };
