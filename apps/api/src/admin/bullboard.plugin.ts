/**
 * FastifyBullBoardPlugin — integrates @bull-board/fastify with the
 * NestJS FastifyAdapter without ejecting to Express.
 *
 * PATCH 2: Redis config now uses REDIS_URL via IORedis — eliminates
 * manual REDIS_HOST/PORT/PASSWORD parsing. TLS-compatible (rediss://).
 *
 * PATCH 3: Queue names from MONITORED_QUEUES registry — zero magic
 * strings, zero drift when new queues are added to queue-names.ts.
 *
 * Call FastifyBullBoardPlugin.register(app) in main.ts AFTER
 * app.init() but BEFORE app.listen().
 *
 * Security:
 *   The Fastify plugin registers a preHandler hook that validates
 *   X-Internal-Secret in non-development environments.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { createBullBoard } from '@bull-board/api';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import { Queue } from 'bullmq';
import { createRedisConnection, MONITORED_QUEUES } from '@octo/queue';

export const BULLBOARD_BASEPATH = '/admin/queues/board';

export class FastifyBullBoardPlugin {
  static async register(app: NestFastifyApplication): Promise<void> {
    // PATCH 2: single REDIS_URL — matches all other system consumers.
    // Uses createRedisConnection from @octo/queue for consistent config.
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const connection = createRedisConnection(redisUrl);

    // PATCH 3: names from MONITORED_QUEUES registry — no hardcoded strings.
    const queues = MONITORED_QUEUES.map(
      (name) => new BullMQAdapter(new Queue(name, { connection })),
    );

    const serverAdapter = new BullBoardFastifyAdapter();
    serverAdapter.setBasePath(BULLBOARD_BASEPATH);

    createBullBoard({ queues, serverAdapter });

    // Access the raw Fastify instance from the NestJS adapter
     
    const fastifyInstance = app.getHttpAdapter().getInstance() as any;

    // Register the bull-board UI as a Fastify plugin
    await fastifyInstance.register(
       
      serverAdapter.registerPlugin(),
      {
        prefix: BULLBOARD_BASEPATH,
        logLevel: 'warn',
      },
    );

    // Enforce X-Internal-Secret on all BullBoard routes outside development
    fastifyInstance.addHook(
      'preHandler',
      async (
        request: { url: string; headers: Record<string, string | undefined> },
        reply: { code: (n: number) => { send: (b: unknown) => void } },
      ) => {
        if (!request.url.startsWith(BULLBOARD_BASEPATH)) return;
        if (process.env['NODE_ENV'] === 'development') return;

        const secret = request.headers['x-internal-secret'];
        const expected = process.env['API_INTERNAL_SECRET'];
        if (!expected || secret !== expected) {
          reply.code(401).send({ message: 'Invalid internal secret' });
        }
      },
    );
  }
}
