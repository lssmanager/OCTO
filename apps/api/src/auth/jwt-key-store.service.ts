import { Injectable } from '@nestjs/common';
import { isUnsafeProductionJwtSecret } from '@octo/config';

export type JwtKeyConfig = {
  kid: string;
  algorithm: 'HS256' | 'RS256';
  isActive: boolean;
  secret?: string;
  publicKey?: string;
  privateKey?: string;
};

const DEFAULT_HS256_KID = 'dev-hs256';
const MIN_PRODUCTION_HS256_SECRET_LENGTH = 32;
const UNSAFE_PRODUCTION_SECRET_MESSAGE =
  'AUTH_CONFIG_INVALID: published or development JWT signing secrets must not be used in production';

@Injectable()
export class JwtKeyStoreService {
  private readonly keys: JwtKeyConfig[];

  constructor() {
    this.keys = this.loadKeys();
    this.validateKeys(this.keys);
  }

  getVerificationKey(kid: string, alg: string): JwtKeyConfig | null {
    return this.keys.find((k) => k.kid === kid && k.algorithm === alg) ?? null;
  }

  listPublicJwks() {
    return {
      keys: this.keys
        .filter((k) => k.algorithm === 'RS256' && k.publicKey)
        .map((k) => ({ kid: k.kid, kty: 'RSA', alg: 'RS256', use: 'sig' })),
    };
  }

  private loadKeys(): JwtKeyConfig[] {
    const raw = process.env['JWT_SIGNING_KEYS'];
    if (raw) return JSON.parse(raw) as JwtKeyConfig[];

    const secret = process.env['JWT_SECRET'];
    if (!secret) throw new Error('AUTH_CONFIG_INVALID: JWT_SIGNING_KEYS or JWT_SECRET is required');

    return [
      {
        kid: process.env['JWT_KID'] ?? DEFAULT_HS256_KID,
        algorithm: 'HS256',
        isActive: true,
        secret,
      },
    ];
  }

  private validateKeys(keys: JwtKeyConfig[]) {
    const active = keys.filter((k) => k.isActive);
    if (active.length !== 1)
      throw new Error('AUTH_CONFIG_INVALID: exactly one active signing key required');

    for (const key of keys) {
      if (!key.kid) throw new Error('AUTH_CONFIG_INVALID: signing key kid is required');
      if (key.algorithm === 'HS256' && !key.secret)
        throw new Error('AUTH_CONFIG_INVALID: HS256 signing keys require a secret');
      if (key.algorithm === 'RS256' && !key.publicKey)
        throw new Error('AUTH_CONFIG_INVALID: RS256 signing keys require a publicKey');
      if (
        this.isProduction() &&
        key.algorithm === 'HS256' &&
        isUnsafeProductionJwtSecret(key.secret)
      ) {
        throw new Error(UNSAFE_PRODUCTION_SECRET_MESSAGE);
      }
    }

    const activeKey = active[0]!;
    if (
      this.isProduction() &&
      activeKey.algorithm === 'HS256' &&
      (activeKey.secret?.length ?? 0) < MIN_PRODUCTION_HS256_SECRET_LENGTH
    ) {
      throw new Error(
        'AUTH_CONFIG_INVALID: production HS256 JWT signing secret must be at least 32 characters'
      );
    }
  }

  private isProduction() {
    return process.env['NODE_ENV'] === 'production';
  }
}
