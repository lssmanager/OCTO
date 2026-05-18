/**
 * InternalSecretGuard — validates X-Internal-Secret header.
 *
 * Used to protect admin endpoints (BullBoard, queue metrics) from
 * unauthorized access. Skips validation in development so local
 * tooling doesn't need the secret.
 *
 * Secret value: API_INTERNAL_SECRET env var (same value used by the
 * runtime worker's X-Internal-Secret header check).
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const isDev = process.env['NODE_ENV'] === 'development';
    if (isDev) return true;

    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest>();

    const secret = (req.headers as Record<string, string | undefined>)[
      'x-internal-secret'
    ];
    const expected = process.env['API_INTERNAL_SECRET'];

    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    return true;
  }
}
