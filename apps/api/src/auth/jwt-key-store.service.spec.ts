import { afterEach, describe, expect, it } from 'vitest';
import { JWT_SECRET_PLACEHOLDER } from '@octo/config';
import { JwtKeyStoreService } from './jwt-key-store.service';

const ORIGINAL_ENV = { ...process.env };

describe('JwtKeyStoreService', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('uses JWT_SECRET as the HS256 verification key when JWT_SIGNING_KEYS is absent outside production', () => {
    process.env.NODE_ENV = 'development';
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

  it('uses a strong JWT_SECRET fallback in production when JWT_SIGNING_KEYS is absent', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SIGNING_KEYS;
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
    process.env.JWT_KID = 'prod-fallback-hs256';

    const keyStore = new JwtKeyStoreService();

    expect(keyStore.getVerificationKey('prod-fallback-hs256', 'HS256')).toMatchObject({
      kid: 'prod-fallback-hs256',
      algorithm: 'HS256',
      isActive: true,
      secret: 'test-secret-test-secret-test-secret',
    });
  });

  it('accepts explicit production JWT_SIGNING_KEYS with an active HS256 key', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNING_KEYS = JSON.stringify([
      {
        kid: 'api-2026-06',
        algorithm: 'HS256',
        isActive: true,
        secret: 'test-secret-test-secret-test-secret',
      },
    ]);

    const keyStore = new JwtKeyStoreService();

    expect(keyStore.getVerificationKey('api-2026-06', 'HS256')).toMatchObject({
      kid: 'api-2026-06',
      algorithm: 'HS256',
      isActive: true,
    });
  });

  it('rejects the built-in development JWT secret in production signing keys', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNING_KEYS = JSON.stringify([
      { kid: 'dev-hs256', algorithm: 'HS256', isActive: true, secret: 'dev-secret' },
    ]);

    expect(() => new JwtKeyStoreService()).toThrow(/must not be used in production/);
  });

  it('rejects the published JWT_SECRET placeholder when configured as an active HS256 signing key in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNING_KEYS = JSON.stringify([
      {
        kid: 'published-placeholder',
        algorithm: 'HS256',
        isActive: true,
        secret: JWT_SECRET_PLACEHOLDER,
      },
    ]);

    expect(() => new JwtKeyStoreService()).toThrow(/must not be used in production/);
  });

  it('allows the published JWT_SECRET placeholder outside production fallback mode', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SIGNING_KEYS;
    process.env.JWT_SECRET = JWT_SECRET_PLACEHOLDER;

    const keyStore = new JwtKeyStoreService();

    expect(keyStore.getVerificationKey('dev-hs256', 'HS256')).toMatchObject({
      kid: 'dev-hs256',
      algorithm: 'HS256',
      isActive: true,
      secret: JWT_SECRET_PLACEHOLDER,
    });
  });

  it('rejects missing JWT signing material instead of accepting a hard-coded fallback', () => {
    delete process.env.JWT_SIGNING_KEYS;
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;

    expect(() => new JwtKeyStoreService()).toThrow(/JWT_SIGNING_KEYS or JWT_SECRET is required/);
  });
});
