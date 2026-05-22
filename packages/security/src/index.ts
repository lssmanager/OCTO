/**
 * @octo/security — Auth, encryption, secrets baseline.
 *
 * F0: SecurityModule is a no-op global module placeholder.
 *     InternalSecretGuard lives in apps/api/src/admin/ to avoid
 *     pnpm-store class-identity issues with NestJS DI.
 * F1+: JWT authentication, Passport strategies, multi-tenancy enforcement.
 */
export const SECURITY_PACKAGE_VERSION = '0.0.1' as const;

export type SecretKey = string & { readonly __brand: 'SecretKey' };

export interface SecurityConfig {
  readonly jwtSecret: SecretKey;
  readonly jwtExpiresIn: string;
}

// F0 — Global no-op module (shell for F1 additions)
export { SecurityModule } from './security.module';

