import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual, createHash } from 'node:crypto';
import type { OctoRequest } from '../types/octo-request';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<OctoRequest>();
    const serviceName = String(req.headers['x-service-name'] ?? '');
    const apiKey = String(req.headers['x-service-api-key'] ?? '');
    const map = JSON.parse(process.env['INTERNAL_SERVICE_API_KEYS'] ?? '{}') as Record<string, { keyHash: string; scopes: string[]; roles: string[] }>;
    const item = map[serviceName];
    if (!item) throw new UnauthorizedException({ code: 'SERVICE_UNAUTHORIZED', message: 'Invalid service credentials' });
    const hash = `sha256:${createHash('sha256').update(apiKey).digest('hex')}`;
    const ok = hash.length === item.keyHash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(item.keyHash));
    if (!ok) throw new UnauthorizedException({ code: 'SERVICE_UNAUTHORIZED', message: 'Invalid service credentials' });
    req.serviceId = serviceName;
    req.scopes = item.scopes;
    req.roles = item.roles;
    return true;
  }
}
