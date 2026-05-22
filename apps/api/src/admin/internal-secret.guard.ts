/**
 * InternalSecretGuard — validates X-Internal-Secret header.
 *
 * F0: Minimum viable API protection. Guards ALL routes globally via
 * APP_GUARD, except those marked with @Public().
 *
 * In development (NODE_ENV=development), bypasses with a warning log.
 * In production, rejects requests missing or mismatching the
 * INTERNAL_SECRET env var.
 *
 * Routes that MUST be public:
 *   - /api/health/*  (K8s probes, monitoring)
 *   - /api/ops/*     (infrastructure status)
 *
 * JWT/AuthModule is F1 — NOT implemented here.
 */
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
 * Decorator: marks a controller or handler as publicly accessible.
 * Routes decorated with @Public() skip this guard.
 *
 * Uses NestJS SetMetadata() which correctly sets metadata on the class
 * constructor (not the prototype), matching what Reflector.getAllAndOverride()
 * reads via context.getClass() and context.getHandler().
 *
 * Usage:
 *   @Public()
 *   @Controller('health')
 *   export class HealthController { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

const logger = createLogger({ service: 'internal-secret-guard' });

@Injectable()
export class InternalSecretGuard implements CanActivate {
  // Reflector is a global NestJS core provider — always available in every
  // DI scope, including the root module scope where APP_GUARD is resolved.
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // ── Skip guard for @Public() routes ───────────────────────────────────────
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // ── Development bypass ───────────────────────────────────────────────────
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    if (nodeEnv === 'development') {
      logger.warn({
        event: 'guard_dev_bypass',
        trace_id: 'security',
        msg: 'InternalSecretGuard bypassed in development mode. '
          + 'Set NODE_ENV=production to enforce.',
      });
      return true;
    }

    // ── Production enforcement ────────────────────────────────────────────────
    const expected = process.env['INTERNAL_SECRET'];
    if (!expected) {
      logger.error({
        event: 'guard_no_secret_configured',
        trace_id: 'security',
        msg: 'INTERNAL_SECRET env var is not set. All internal requests will be rejected.',
      });
      throw new UnauthorizedException('Service misconfigured: INTERNAL_SECRET not set');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const provided = request.headers?.['x-internal-secret'];

    if (!provided || provided !== expected) {
      logger.warn({
        event: 'guard_unauthorized',
        trace_id: 'security',
        msg: 'InternalSecretGuard rejected request — missing or invalid X-Internal-Secret header',
        has_header: !!provided,
      });
      throw new UnauthorizedException('Missing or invalid X-Internal-Secret header');
    }

    return true;
  }
}

