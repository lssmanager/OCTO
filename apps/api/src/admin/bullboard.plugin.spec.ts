import fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@octo/queue', () => ({
  MONITORED_QUEUES: ['execution.dispatch'],
  createBullMqConnection: vi.fn(() => ({ status: 'mock-redis-connection' })),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function MockQueue(this: { name: string }, name: string) {
    this.name = name;
  }),
}));

vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: vi.fn().mockImplementation(function MockBullMQAdapter(
    this: { queue: unknown },
    queue: unknown
  ) {
    this.queue = queue;
  }),
}));

vi.mock('@bull-board/api', () => ({
  createBullBoard: vi.fn(),
}));

vi.mock('@bull-board/fastify', () => ({
  FastifyAdapter: vi.fn().mockImplementation(function MockFastifyAdapter(this: {
    setBasePath: (path: string) => void;
    registerPlugin: () => (instance: any) => Promise<void>;
  }) {
    this.setBasePath = vi.fn();
    this.registerPlugin = vi.fn(() => async (instance: any) => {
      instance.get('/', async () => '<html>BullBoard admin</html>');
      instance.get('/static/app.js', async () => 'console.log("BullBoard asset")');
    });
  }),
}));

import { BULLBOARD_BASEPATH, FastifyBullBoardPlugin } from './bullboard.plugin';

const VALID_SECRET = 'bullboard-secret-for-tests-minimum-32-chars';

function nestAppFromFastify(instance: ReturnType<typeof fastify>) {
  return {
    getHttpAdapter: () => ({
      getInstance: () => instance,
    }),
  } as any;
}

describe('FastifyBullBoardPlugin auth boundary', () => {
  const originalInternalSecret = process.env['INTERNAL_SECRET'];
  const originalRedisUrl = process.env['REDIS_URL'];

  afterEach(() => {
    if (originalInternalSecret === undefined) {
      delete process.env['INTERNAL_SECRET'];
    } else {
      process.env['INTERNAL_SECRET'] = originalInternalSecret;
    }

    if (originalRedisUrl === undefined) {
      delete process.env['REDIS_URL'];
    } else {
      process.env['REDIS_URL'] = originalRedisUrl;
    }
  });

  it('fails closed at registration when INTERNAL_SECRET is missing', async () => {
    delete process.env['INTERNAL_SECRET'];
    const instance = fastify({ logger: false });

    await expect(FastifyBullBoardPlugin.register(nestAppFromFastify(instance))).rejects.toThrow(
      /INTERNAL_SECRET/
    );

    await instance.close();
  });

  it('requires x-internal-secret before BullBoard handlers and assets respond', async () => {
    process.env['INTERNAL_SECRET'] = VALID_SECRET;
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    const instance = fastify({ logger: false });

    await FastifyBullBoardPlugin.register(nestAppFromFastify(instance));
    await instance.ready();

    const unauthenticatedUi = await instance.inject({ method: 'GET', url: BULLBOARD_BASEPATH });
    const unauthenticatedAsset = await instance.inject({
      method: 'GET',
      url: `${BULLBOARD_BASEPATH}/static/app.js`,
    });
    const authenticatedUi = await instance.inject({
      method: 'GET',
      url: BULLBOARD_BASEPATH,
      headers: { 'x-internal-secret': VALID_SECRET },
    });

    expect(unauthenticatedUi.statusCode).toBe(401);
    expect(unauthenticatedUi.body).not.toContain('BullBoard admin');
    expect(unauthenticatedAsset.statusCode).toBe(401);
    expect(unauthenticatedAsset.body).not.toContain('BullBoard asset');
    expect(authenticatedUi.statusCode).toBe(200);
    expect(authenticatedUi.body).toContain('BullBoard admin');

    await instance.close();
  });
});
