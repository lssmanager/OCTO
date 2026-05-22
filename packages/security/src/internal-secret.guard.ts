/**
 * MOVED: InternalSecretGuard → apps/api/src/admin/internal-secret.guard.ts
 *
 * The guard was moved out of @octo/security to avoid pnpm-store
 * class-identity issues with NestJS DI. When a package is built and
 * linked via pnpm's virtual store, NestJS resolves APP_GUARD against
 * a different class identity than the one registered as a provider,
 * causing constructor-injected dependencies (Reflector) to be undefined.
 *
 * The guard is now:
 *   - Defined in: apps/api/src/admin/internal-secret.guard.ts
 *   - Registered as APP_GUARD in: apps/api/src/app.module.ts
 *   - Decorator @Public() exported from the same file
 *
 * @octo/security SecurityModule remains as a no-op @Global() shell
 * for F1+ JWT/Passport additions.
 */

