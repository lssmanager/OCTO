// apps/api/src/admin/internal-secret.guard.ts
// F0: InternalSecretGuard — single source of truth for API protection.
//
// This guard lives here (not in @octo/security) to guarantee a single
// class identity. When APP_GUARD is resolved by NestJS, it must match
// the exact same class registered as a provider in AppModule. If the
// guard comes from @octo/security (pnpm virtual store), the class
// resolved by APP_GUARD is a different identity from the registered
// provider, and NestJS silently fails to inject Reflector:
//   TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')
//
// By keeping the guard in apps/api, the class used by APP_GUARD and the
// class registered as InternalSecretGuard provider are always the same
// file — no store, no dual resolution, no identity mismatch.
//
// @Public() decorator is also defined here so controllers import from
// one local path instead of the package.

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createLogger } from '@octo/observability';

/** Decorator key for marking public (unauthenticated) routes. */
export const IS_PUBLIC_KEY = 'IS_PUBLIC';

/**
 * Marks a controller or handler as publicly accessible.
 * Routes decorated with @Public() skip InternalSecretGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

const logger = createLogger({ service: 'internal-secret-guard' });

@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip guard for @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Explicit insecure bypass (opt-in only for local debugging)
    const bypass = process.env['ALLOW_INSECURE_INTERNAL_SECRET_BYPASS'] === 'true';
    if (bypass) {
      logger.warn({
        event: 'guard_explicit_insecure_bypass',
        trace_id: 'security',
        msg: 'InternalSecretGuard bypass enabled via ALLOW_INSECURE_INTERNAL_SECRET_BYPASS=true.',
      });
      return true;
    }

    // Default enforcement (fail-closed)
    const expected = process.env['INTERNAL_SECRET'];
    if (!expected) {
      logger.error({
        event: 'guard_no_secret_configured',
        trace_id: 'security',
        msg: 'INTERNAL_SECRET env var is not set. All requests will be rejected.',
      });
      throw new UnauthorizedException('Service misconfigured: INTERNAL_SECRET not set');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const provided = request.headers?.['x-internal-secret'];

    if (!provided || provided !== expected) {
      logger.warn({
        event: 'guard_unauthorized',
        trace_id: 'security',
        msg: 'Rejected request — missing or invalid X-Internal-Secret header',
        has_header: !!provided,
      });
      throw new UnauthorizedException('Missing or invalid X-Internal-Secret header');
    }

    return true;
  }
}
