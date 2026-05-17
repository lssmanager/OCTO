/**
 * @octo/security — Auth, encryption, secrets baseline
 * Full implementation: see issue #15 (F0-014)
 */
export const SECURITY_PACKAGE_VERSION = '0.0.1' as const;

export type SecretKey = string & { readonly __brand: 'SecretKey' };

export interface SecurityConfig {
  readonly jwtSecret: SecretKey;
  readonly jwtExpiresIn: string;
}
