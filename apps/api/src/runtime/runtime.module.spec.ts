import { Test } from '@nestjs/testing';
import { RuntimeModule } from './runtime.module';

describe('RuntimeModule', () => {
  it('compiles with auth guards wired through DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeModule],
    }).compile();

    expect(moduleRef).toBeDefined();
  });
});
