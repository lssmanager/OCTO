// packages/security/src/security.module.ts
// F0: empty shell — reserved for F1 JWT / RBAC providers.
//
// InternalSecretGuard has been moved to apps/api/src/admin/internal-secret.guard.ts.
// AppModule imports SecurityModule for forward compatibility only.
import { Module } from '@nestjs/common';

@Module({})
export class SecurityModule {}
