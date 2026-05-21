// packages/security/src/security.module.ts
// F0: SecurityModule — minimum viable NestJS security.
//
// Registers InternalSecretGuard as APP_GUARD (global) so Nest resolves
// the Reflector dependency in the same DI scope where the guard is declared.
// Moving APP_GUARD here (instead of AppModule) avoids a second instance
// being created outside the SecurityModule context, which left Reflector
// undefined and caused:
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
      useClass: InternalSecretGuard,
    },
  ],
  exports: [InternalSecretGuard],
})
export class SecurityModule {}

// Re-export decorator for convenience
export { Public, InternalSecretGuard };
