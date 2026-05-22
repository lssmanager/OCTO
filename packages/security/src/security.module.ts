// packages/security/src/security.module.ts
// F0: SecurityModule — exports InternalSecretGuard for DI.
//
// APP_GUARD is intentionally NOT registered here.
//
// NestJS resolves Reflector for APP_GUARD from the root module scope.
// If APP_GUARD is registered inside a child module (even @Global()),
// the injected Reflector is a different instance from the one NestJS
// uses internally for metadata resolution — causing:
//   TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')
//
// Canonical fix: register APP_GUARD in AppModule (root scope) so that
// NestJS injects the correct root-scope Reflector instance.
// SecurityModule only provides + exports the guard class for DI.

import { Module } from '@nestjs/common';
import { InternalSecretGuard, Public } from './internal-secret.guard';

@Module({
  providers: [InternalSecretGuard],
  exports: [InternalSecretGuard],
})
export class SecurityModule {}

// Re-export decorator for convenience
export { Public, InternalSecretGuard };
