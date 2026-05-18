/**
 * FastifyBullBoardPlugin — integrates @bull-board/fastify with the
 * NestJS FastifyAdapter without ejecting to Express.
 *
 * How it works:
 *   1. Creates a BullMQAdapter for each registered queue.
 *   2. Creates a BullBoard ServerAdapter for Fastify.
 *   3. Sets the basePath for the UI: /admin/queues/board
 *   4. Registers the adapter as a Fastify plugin on the raw Fastify
 *      instance obtained from app.getHttpAdapter().getInstance().
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

export const BULLBOARD_BASEPATH = '/admin/queues/board';

const QUEUE_NAMES = [
  'executions',
  'delegations',
  'tool-invocations',
  'approvals',
  'dlq-executions',
] as const;

export class FastifyBullBoardPlugin {
  static async register(app: NestFastifyApplication): Promise<void> {
    const connection = {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: Number(process.env['REDIS_PORT'] ?? 6379),
      password: process.env['REDIS_PASSWORD'] ?? undefined,
    };

    const queues = QUEUE_NAMES.map(
      (name) => new BullMQAdapter(new Queue(name, { connection })),
    );

    const serverAdapter = new BullBoardFastifyAdapter();
    serverAdapter.setBasePath(BULLBOARD_BASEPATH);

    createBullBoard({ queues, serverAdapter });

    // Access the raw Fastify instance from the NestJS adapter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fastifyInstance = app.getHttpAdapter().getInstance() as any;

    // Register the bull-board UI as a Fastify plugin
    // preHandler applies the internal secret guard outside NestJS middleware
    await fastifyInstance.register(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      serverAdapter.registerPlugin(),
      {
        prefix: BULLBOARD_BASEPATH,
        // Fastify plugin options
        logLevel: 'warn',
      },
    );

    // Attach a preHandler hook on the board prefix to enforce secret
    fastifyInstance.addHook(
      'preHandler',
      async (request: { url: string; headers: Record<string, string | undefined> }, reply: { code: (n: number) => { send: (b: unknown) => void } }) => {
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
