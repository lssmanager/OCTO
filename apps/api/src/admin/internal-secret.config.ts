import { timingSafeEqual } from 'node:crypto';

export const INTERNAL_SECRET_ENV_NAME = 'INTERNAL_SECRET';
export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

const MIN_INTERNAL_SECRET_LENGTH = 32;

export function getRequiredInternalSecret(): string {
  const secret = process.env[INTERNAL_SECRET_ENV_NAME];
  if (!secret || secret.length < MIN_INTERNAL_SECRET_LENGTH) {
    throw new Error(
      `${INTERNAL_SECRET_ENV_NAME} must be set and at least ${MIN_INTERNAL_SECRET_LENGTH} characters long`
    );
  }
  return secret;
}

export function internalSecretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
