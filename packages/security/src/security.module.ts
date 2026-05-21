// packages/security/src/security.module.ts
// F0: SecurityModule — minimum viable NestJS security.
//
// Registers InternalSecretGuard as APP_GUARD (global) so Nest resolves
// the Reflector dependency in the same DI scope where the guard is declared.
//
// FIX: useClass on APP_GUARD created a second independent instance of the
// guard that did NOT receive Reflector via DI, causing:
//   TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')
//
// useExisting reuses the already-resolved InternalSecretGuard instance
// (which has Reflector correctly injected) instead of creating a new one.
// This guarantees a single instance with a fully hydrated DI context.
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
