/**
 * @octo/security — Auth, encryption, secrets baseline.
 *
 * F0: Minimum viable API protection via InternalSecretGuard.
 * F1+: JWT authentication, Passport strategies, multi-tenancy enforcement.
 */
export const SECURITY_PACKAGE_VERSION = '0.0.1' as const;

export type SecretKey = string & { readonly __brand: 'SecretKey' };

export interface SecurityConfig {
  readonly jwtSecret: SecretKey;
  readonly jwtExpiresIn: string;
}

// F0 — Internal secret guard + NestJS module
export { SecurityModule, InternalSecretGuard, Public } from './security.module';

