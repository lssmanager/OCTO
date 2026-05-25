export const OCTO_EVENTS_STREAM = 'octo.events';
export const OCTO_EVENT_GROUPS = {
  websocket: 'octo.events.websocket',
  ops: 'octo.events.ops',
  audit: 'octo.events.audit',
} as const;

export interface RedisGroupClient {
  xgroup: (subcommand: string, key: string, group: string, id: string, ...args: (string | number)[]) => Promise<unknown>;
  set: (key: string, value: string, ...args: (string | number)[]) => Promise<'OK' | null>;
}

export async function ensureConsumerGroups(redis: RedisGroupClient, stream = OCTO_EVENTS_STREAM): Promise<void> {
  for (const group of Object.values(OCTO_EVENT_GROUPS)) {
    try {
      await redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'BUSYGROUP') {
        continue;
      }
      throw error;
    }
  }
}

export async function shouldProcessEventIdempotent(
  redis: RedisGroupClient,
  tenantId: string,
  eventId: string,
  ttlSeconds = 3600
): Promise<boolean> {
  const key = `octo:${tenantId}:evt:processed:${eventId}`;
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export const OCTO_EVENT_CONSUMER_GROUPS = OCTO_EVENT_GROUPS;
export async function ensureEventConsumerGroups(redis: RedisGroupClient): Promise<void> { return ensureConsumerGroups(redis); }
export async function markEventProcessedOnce(params: { redis: RedisGroupClient; tenantId: string; eventId: string; ttlSeconds?: number; }): Promise<boolean> {
  return shouldProcessEventIdempotent(params.redis, params.tenantId, params.eventId, params.ttlSeconds ?? 3600);
}
