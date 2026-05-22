// packages/security/src/security.module.ts
// F0: SecurityModule — re-exports Public decorator and InternalSecretGuard type.
//
// This module does NOT register InternalSecretGuard as a provider and does
// NOT register APP_GUARD. Both must live in AppModule (root scope).
//
// Why: NestJS resolves Reflector for APP_GUARD from the root DI container.
// If InternalSecretGuard is provided inside a child module (even @Global()),
// the Reflector injected into the guard constructor is a different instance
// from the root-scope Reflector NestJS uses for metadata resolution, causing:
//   TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')
//
// Canonical NestJS pattern:
//   - Guard provider in AppModule
//   - APP_GUARD { useExisting: GuardClass } in AppModule
//   - SecurityModule only re-exports the decorator for use in controllers

import { Module } from '@nestjs/common';
import { Public } from './internal-secret.guard';

@Module({})
export class SecurityModule {}

// Re-export decorator and guard class for consumers
export { Public };
export { InternalSecretGuard } from './internal-secret.guard';
