import { afterEach, describe, expect, it } from 'vitest';
import { JwtKeyStoreService } from './jwt-key-store.service';

const ORIGINAL_ENV = { ...process.env };

describe('JwtKeyStoreService', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('uses JWT_SECRET as the HS256 verification key when JWT_SIGNING_KEYS is absent', () => {
    delete process.env.JWT_SIGNING_KEYS;
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
    process.env.JWT_KID = 'test-hs256';

    const keyStore = new JwtKeyStoreService();

    expect(keyStore.getVerificationKey('test-hs256', 'HS256')).toMatchObject({
      kid: 'test-hs256',
      algorithm: 'HS256',
      isActive: true,
      secret: 'test-secret-test-secret-test-secret',
    });
    expect(keyStore.getVerificationKey('dev-hs256', 'HS256')).toBeNull();
  });

  it('rejects the built-in development JWT secret in production signing keys', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNING_KEYS =
      '[{"kid":"dev-hs256","algorithm":"HS256","isActive":true,"secret":"dev-secret"}]';

    expect(() => new JwtKeyStoreService()).toThrow(/dev-secret must not be used/);
  });

  it('rejects missing JWT signing material instead of accepting a hard-coded fallback', () => {
    delete process.env.JWT_SIGNING_KEYS;
    delete process.env.JWT_SECRET;

    expect(() => new JwtKeyStoreService()).toThrow(/JWT_SIGNING_KEYS or JWT_SECRET is required/);
  });
});
