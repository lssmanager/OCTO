// packages/security/src/security.module.ts
// F0: SecurityModule — no-op global module placeholder.
//
// InternalSecretGuard has been moved into apps/api/src/admin/ to avoid
// pnpm-store class-identity issues with NestJS DI. APP_GUARD is now
// registered in AppModule with the local guard class.
//
// This module stays as a shell for F1+ additions: JWT strategies,
// Passport integration, multi-tenancy enforcement, etc.

import { Module, Global } from '@nestjs/common';

@Global()
@Module({})
export class SecurityModule {}
