export const JWT_SECRET_PLACEHOLDER = 'change-me-in-production-min-32-chars';

const UNSAFE_PRODUCTION_JWT_SECRETS = new Set([
  'dev-secret',
  JWT_SECRET_PLACEHOLDER,
]);

export function isUnsafeProductionJwtSecret(secret: string | null | undefined): boolean {
  return !!secret && UNSAFE_PRODUCTION_JWT_SECRETS.has(secret);
}
