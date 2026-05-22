// packages/security/src/internal-secret.guard.ts
// RELOCATED to apps/api/src/admin/internal-secret.guard.ts
//
// The guard was moved to apps/api to ensure a single class identity.
// When APP_GUARD resolves a class from the pnpm virtual store, NestJS
// sees a different class identity than the registered provider, causing
// Reflector injection to fail silently.
//
// This file is intentionally empty. Do not add guards here.
// For F1 (JWT), add a JwtAuthGuard in apps/api following the same pattern.

export {};
