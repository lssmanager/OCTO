export const OCTO_EVENTS_STREAM = 'octo.events';
export const OCTO_EVENT_GROUPS = {
  websocket: 'octo.events.websocket',
  ops: 'octo.events.ops',
  audit: 'octo.events.audit',
} as const;

export interface RedisGroupClient {
  xgroup: (subcommand: 'CREATE', key: string, group: string, id: '$', mkstream: 'MKSTREAM') => Promise<unknown>;
  set: (key: string, value: string, mode: 'EX', ttlSeconds: number, nx: 'NX') => Promise<'OK' | null>;
}

export async function ensureConsumerGroups(redis: RedisGroupClient, stream = OCTO_EVENTS_STREAM): Promise<void> {
  for (const group of Object.values(OCTO_EVENT_GROUPS)) {
    try {
      await redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
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
