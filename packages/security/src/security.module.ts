// packages/security/src/security.module.ts
// F0: SecurityModule — minimum viable NestJS security.
//
// Registers InternalSecretGuard as APP_GUARD (global).
//
// The guard resolves Reflector lazily via ModuleRef.get() in OnModuleInit
// instead of constructor injection — this avoids the DI scope mismatch
// that occurs when APP_GUARD is instantiated as a global provider and
// left this.reflector undefined:
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
