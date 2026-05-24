import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import type { OctoRequest } from '../types/octo-request';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (!required.length) return true;
    const req = context.switchToHttp().getRequest<OctoRequest>();
    const scopes = req.scopes ?? [];
    if (!required.every((s) => scopes.includes(s))) throw new ForbiddenException({ code: 'INSUFFICIENT_SCOPE', message: 'Insufficient scope', requiredScopes: required });
    return true;
  }
}
