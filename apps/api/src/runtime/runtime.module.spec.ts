import { Test } from '@nestjs/testing';
import { beforeAll } from 'vitest';
import { RuntimeModule } from './runtime.module';

beforeAll(() => {
  process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'jwt-secret-dev-jwt-secret-dev-32';
  process.env['INTERNAL_SECRET'] =
    process.env['INTERNAL_SECRET'] ?? 'internal-secret-dev-internal-secret-dev';
});

describe('RuntimeModule', () => {
  it('compiles with auth guards wired through DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeModule],
    }).compile();

    expect(moduleRef).toBeDefined();
  });
});
