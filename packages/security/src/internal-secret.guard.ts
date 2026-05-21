// packages/security/src/internal-secret.guard.ts
// F0: InternalServiceGuard — minimum viable API protection.
//
// Verifies X-Internal-Secret header against INTERNAL_SECRET env var.
// In development (NODE_ENV=development), allows all requests with a warning log.
// In production, throws UnauthorizedException if the header is missing or wrong.
//
// Excludes /health/* and /ops/* routes via @Public() decorator metadata.
// JWT/AuthModule is F1 — NOT implemented here.

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createLogger } from '@octo/observability';

/** Decorator key for marking public (unauthenticated) routes. */
export const IS_PUBLIC_KEY = Symbol('IS_PUBLIC');

/**
 * Decorator: marks a controller or handler as publicly accessible.
 * Routes decorated with @Public() skip the InternalSecretGuard.
 *
 * Usage:
 *   @Public()
 *   @Controller('health')
 *   export class HealthController { ... }
 */
export function Public(): MethodDecorator & ClassDecorator {
  return (
    target: object,
    _propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, descriptor.value);
    } else {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
    }
  };
}

const logger = createLogger({ service: 'internal-secret-guard' });

@Injectable()
export class InternalSecretGuard implements CanActivate {
  // Reflector is a global NestJS core provider — always available in every
  // DI scope, including the root module scope where APP_GUARD is resolved.
  // Injecting it directly in the constructor avoids the ModuleRef.get()
  // workaround that caused: TypeError: Cannot read properties of undefined
  // (reading 'get') at InternalSecretGuard.onModuleInit
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // ── Skip guard for @Public() routes ───────────────────────────────────────
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // ── Development bypass ───────────────────────────────────────────────────────
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

    // ── Production enforcement ──────────────────────────────────────────────────
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
