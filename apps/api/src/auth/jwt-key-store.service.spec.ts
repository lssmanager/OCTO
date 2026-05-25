import { describe, expect, it } from 'vitest';
import { JwtKeyStoreService } from './jwt-key-store.service';

describe('JwtKeyStoreService', () => {
  it('fails closed when JWT_SIGNING_KEYS is missing', () => {
    delete process.env.JWT_SIGNING_KEYS;
    expect(() => new JwtKeyStoreService()).toThrow('AUTH_CONFIG_INVALID: JWT_SIGNING_KEYS is required');
  });
});
