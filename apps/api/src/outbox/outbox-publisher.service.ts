import { buildOutboxPublisherWithBus, type OutboxPublisherDb, type OutboxPublisherMetrics } from '@octo/events';
import { EventEnvelopeSchema } from '@octo/contracts';

export interface OutboxEventBus {
  publish: (event: ReturnType<typeof EventEnvelopeSchema.parse>) => Promise<void>;
}

export function buildOutboxPublisher(deps: {
  db: OutboxPublisherDb;
  bus: OutboxEventBus;
  metrics: OutboxPublisherMetrics;
}) {
  return buildOutboxPublisherWithBus(deps);
}
