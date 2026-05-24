import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { OctoRequest } from '../types/octo-request';
import type { OctoJwtPayload } from '../types/jwt-payload';

@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<OctoRequest>();
    const user = req.user as OctoJwtPayload | undefined;
    if (!user?.tenant_id) throw new ForbiddenException({ code: 'TENANT_CONTEXT_MISSING', message: 'Tenant context missing' });
    req.tenantId = user.tenant_id;
    req.userId = user.sub;
    req.scopes = user.scopes ?? [];
    req.roles = user.roles ?? [];
    return true;
  }
}
