export const OCTO_EVENTS_STREAM = 'octo.events';
export const OCTO_EVENT_GROUPS = {
  websocket: 'octo.events.websocket',
  ops: 'octo.events.ops',
  audit: 'octo.events.audit',
} as const;

export const OCTO_CONSUMER_GROUP_START_ID = '0';

export interface RedisGroupClient {
  xgroup: (
    subcommand: 'CREATE',
    key: string,
    group: string,
    id: string,
    mkstream: 'MKSTREAM'
  ) => Promise<unknown>;
  set: (
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
    nx: 'NX'
  ) => Promise<'OK' | null>;
}

export async function ensureConsumerGroups(
  redis: RedisGroupClient,
  stream = OCTO_EVENTS_STREAM
): Promise<void> {
  for (const group of Object.values(OCTO_EVENT_GROUPS)) {
    try {
      await redis.xgroup('CREATE', stream, group, OCTO_CONSUMER_GROUP_START_ID, 'MKSTREAM');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('BUSYGROUP')) throw error;
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
export async function ensureEventConsumerGroups(redis: RedisGroupClient): Promise<void> {
  return ensureConsumerGroups(redis);
}
export async function markEventProcessedOnce(params: {
  redis: RedisGroupClient;
  tenantId: string;
  eventId: string;
  ttlSeconds?: number;
}): Promise<boolean> {
  return shouldProcessEventIdempotent(
    params.redis,
    params.tenantId,
    params.eventId,
    params.ttlSeconds ?? 3600
  );
}
