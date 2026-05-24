import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, createVerify } from 'node:crypto';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { JwtKeyStoreService } from './jwt-key-store.service';
import type { OctoJwtPayload } from './types/jwt-payload';

function b64url(input: string) { return Buffer.from(input, 'base64url').toString('utf8'); }

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly keyStore: JwtKeyStoreService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: OctoJwtPayload }>();
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'INVALID_TOKEN' });
    const token = auth.slice(7);
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'INVALID_TOKEN' });
    const [h, p, s] = parts;
    const header = JSON.parse(b64url(h)) as { alg?: string; kid?: string };
    if (!header.kid || !header.alg) throw new UnauthorizedException({ code: 'JWT_KID_UNKNOWN', message: 'JWT_KID_UNKNOWN' });
    const key = this.keyStore.getVerificationKey(header.kid, header.alg);
    if (!key) throw new UnauthorizedException({ code: 'JWT_KID_UNKNOWN', message: 'JWT_KID_UNKNOWN' });
    const payload = JSON.parse(b64url(p)) as OctoJwtPayload;
    const data = `${h}.${p}`;
    if (header.alg === 'HS256') {
      const expected = createHmac('sha256', key.secret ?? '').update(data).digest('base64url');
      if (expected !== s) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'INVALID_TOKEN' });
    }
    if (header.alg === 'RS256') {
      const ok = createVerify('RSA-SHA256').update(data).end().verify(key.publicKey ?? '', Buffer.from(s, 'base64url'));
      if (!ok) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'INVALID_TOKEN' });
    }
    if (!payload.tenant_id || !payload.sub) throw new UnauthorizedException({ code: 'JWT_TENANT_MISSING', message: 'JWT_TENANT_MISSING' });
    if (payload.exp * 1000 < Date.now()) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'TOKEN_EXPIRED' });
    req.user = payload;
    return true;
  }
}
