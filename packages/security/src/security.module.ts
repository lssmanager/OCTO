// packages/security/src/security.module.ts
// F0: SecurityModule — minimum viable NestJS security.
//
// Exports InternalSecretGuard for registration as APP_GUARD.
// The guard is global: it applies to ALL routes except those marked @Public().

import { Module, Global } from '@nestjs/common';
import { InternalSecretGuard, Public } from './internal-secret.guard';

@Global()
@Module({
  providers: [InternalSecretGuard],
  exports: [InternalSecretGuard],
})
export class SecurityModule {}

// Re-export decorator for convenience
export { Public, InternalSecretGuard };
