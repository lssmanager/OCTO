// packages/security/src/internal-secret.guard.ts
// F0: InternalServiceGuard — minimum viable API protection.
//
// Verifies X-Internal-Secret header against INTERNAL_SECRET env var.
// In development (NODE_ENV=development), allows all requests with a warning log.
// In production, throws UnauthorizedException if the header is missing or wrong.
//
// Excludes /health/* and /ops/* routes via @Public() decorator metadata.
// JWT/AuthModule is F1 — NOT implemented here.
//
// FIX: Reflector is resolved lazily via ModuleRef.get() in OnModuleInit
// instead of constructor injection. This avoids the DI scope mismatch
// that occurs when APP_GUARD is instantiated outside SecurityModule's
// provider scope, which left this.reflector undefined and caused:
//   TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
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
export class InternalSecretGuard implements CanActivate, OnModuleInit {
  // Resolved lazily in onModuleInit to avoid APP_GUARD scope issues.
  private reflector!: Reflector;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    // { strict: false } searches the entire DI container, not just the
    // current module scope — guaranteed to find the global Reflector
    // instance regardless of which scope APP_GUARD was resolved in.
    this.reflector = this.moduleRef.get(Reflector, { strict: false });
  }

  canActivate(context: ExecutionContext): boolean {
    // ── Skip guard for @Public() routes ───────────────────────────────────────
    // Defensive: if reflector is still missing (shouldn't happen after
    // onModuleInit), default to non-public (fail-closed).
    const isPublic = this.reflector
      ? this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          context.getHandler(),
          context.getClass(),
        ])
      : false;

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
