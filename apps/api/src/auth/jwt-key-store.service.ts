import { Injectable } from '@nestjs/common';

export type JwtKeyConfig = { kid: string; algorithm: 'HS256' | 'RS256'; isActive: boolean; secret?: string; publicKey?: string; privateKey?: string };

@Injectable()
export class JwtKeyStoreService {
  private readonly keys: JwtKeyConfig[];

  constructor() {
    const raw = process.env.JWT_SIGNING_KEYS;
    if (!raw) throw new Error('AUTH_CONFIG_INVALID: JWT_SIGNING_KEYS is required');
    this.keys = JSON.parse(raw) as JwtKeyConfig[];
    const active = this.keys.filter((k) => k.isActive);
    if (active.length !== 1) throw new Error('AUTH_CONFIG_INVALID: exactly one active signing key required');
  }

  getVerificationKey(kid: string, alg: string): JwtKeyConfig | null {
    return this.keys.find((k) => k.kid === kid && k.algorithm === alg) ?? null;
  }

  listPublicJwks() {
    return {
      keys: this.keys.filter((k) => k.algorithm === 'RS256' && k.publicKey).map((k) => ({ kid: k.kid, kty: 'RSA', alg: 'RS256', use: 'sig' })),
    };
  }
}
