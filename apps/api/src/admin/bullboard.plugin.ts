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
 *   The Fastify plugin registers a preHandler hook that always validates
 *   X-Internal-Secret with the canonical INTERNAL_SECRET configuration.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import { Queue } from 'bullmq';
import { createBullMqConnection, MONITORED_QUEUES } from '@octo/queue';
import {
  getRequiredInternalSecret,
  INTERNAL_SECRET_HEADER,
  internalSecretsMatch,
} from './internal-secret.config';

export const BULLBOARD_BASEPATH = '/admin/queues/board';

export class FastifyBullBoardPlugin {
  static async register(app: NestFastifyApplication): Promise<void> {
    const expectedInternalSecret = getRequiredInternalSecret();

    // PATCH 2: single REDIS_URL — matches all other system consumers.
    // Uses the shared BullMQ connection helper to avoid pnpm type drift.
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const connection = createBullMqConnection(redisUrl);

    // PATCH 3: names from MONITORED_QUEUES registry — no hardcoded strings.
    const queues = MONITORED_QUEUES.map(
      (name) => new BullMQAdapter(new Queue(name, { connection }))
    );

    const serverAdapter = new BullBoardFastifyAdapter();
    serverAdapter.setBasePath(BULLBOARD_BASEPATH);

    createBullBoard({ queues, serverAdapter });

    // Access the raw Fastify instance from the NestJS adapter

    const fastifyInstance = app.getHttpAdapter().getInstance() as any;

    // Register BullBoard inside an authenticated Fastify encapsulation.
    // The onRequest hook is declared before BullBoard mounts its handlers/assets,
    // so the admin UI fails closed before any route can return useful content.
    await fastifyInstance.register(
      async (securedBullBoard: {
        addHook: (
          name: 'onRequest',
          hook: (
            request: { headers: Record<string, string | string[] | undefined> },
            reply: { code: (n: number) => { send: (b: unknown) => void } }
          ) => Promise<void>
        ) => void;
        register: (plugin: unknown) => Promise<void>;
      }) => {
        securedBullBoard.addHook('onRequest', async (request, reply) => {
          const rawSecret = request.headers[INTERNAL_SECRET_HEADER];
          const secret = Array.isArray(rawSecret) ? rawSecret[0] : rawSecret;
          if (!internalSecretsMatch(secret, expectedInternalSecret)) {
            reply.code(401).send({ message: 'Invalid internal secret' });
          }
        });

        await securedBullBoard.register(serverAdapter.registerPlugin());
      },
      {
        prefix: BULLBOARD_BASEPATH,
        logLevel: 'warn',
      }
    );
  }
}
