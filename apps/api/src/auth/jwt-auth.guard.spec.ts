import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtKeyStoreService } from './jwt-key-store.service';

function token(payload: object) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'dev-hs256' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = createHmac('sha256', 'dev-secret').update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

describe('JwtAuthGuard', () => {
  it('accepts valid jwt and injects user', () => {
    process.env.JWT_SIGNING_KEYS = '[{"kid":"dev-hs256","algorithm":"HS256","isActive":true,"secret":"dev-secret"}]';
    const guard = new JwtAuthGuard(new Reflector(), new JwtKeyStoreService());
    const req: any = { headers: { authorization: `Bearer ${token({ sub:'u1', tenant_id:'t1', roles:['developer'], scopes:['agents:read'], iss:'octo-api', aud:'octo-web', iat:1, exp:9999999999, jti:'j1' })}` } };
    const ctx: any = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => req }) };
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.user.tenant_id).toBe('t1');
  });
});
