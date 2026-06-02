import { z } from 'zod';
import { F1EventTypeSchema } from './event-types';

export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: F1EventTypeSchema,
  tenantId: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  occurredAt: z.string().datetime(),
  schemaVersion: z.literal('1.0'),
  payload: z.record(z.string(), z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
