// packages/security/src/index.ts
// @octo/security — F0 exports
//
// InternalSecretGuard and Public decorator have been relocated to
// apps/api/src/admin/internal-secret.guard.ts to avoid pnpm store
// class identity issues with APP_GUARD resolution.
//
// This package is kept as a shell for F1 (JWT auth, RBAC decorators).
export { SecurityModule } from './security.module';
