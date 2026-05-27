import { publishOutboxBatch, type OutboxPublisherDb, type OutboxPublisherMetrics } from '@octo/events';
import { EventEnvelopeSchema } from '@octo/contracts';
import { eventEnvelopeToRedisFields, redisFieldsToEventEnvelope } from '@octo/events';

export interface OutboxEventBus {
  publish: (event: ReturnType<typeof EventEnvelopeSchema.parse>) => Promise<void>;
}

export class RedisStreamBusAdapter {
  constructor(private readonly redis: { xadd: (stream: string, id: '*', ...fields: string[]) => Promise<string> }, private readonly stream = 'octo.events') {}

  async publish(event: ReturnType<typeof EventEnvelopeSchema.parse>): Promise<void> {
    const fields = eventEnvelopeToRedisFields(event);
    await this.redis.xadd(this.stream, '*', ...fields);
  }
}

export function buildOutboxPublisher(deps: {
  db: OutboxPublisherDb;
  bus: OutboxEventBus;
  metrics: OutboxPublisherMetrics;
}) {
  return {
    async publishOnce() {
      const redisLike = {
        xadd: async (_stream: string, _id: '*', ...fields: string[]) => {
          const kv: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            kv[String(fields[i])] = String(fields[i + 1] ?? '');
          }
          const envelope = redisFieldsToEventEnvelope(kv);
          await deps.bus.publish(EventEnvelopeSchema.parse(envelope));
          return '1-0';
        },
      };
      return publishOutboxBatch({ db: deps.db, redis: redisLike, metrics: deps.metrics });
    },
  };
}
