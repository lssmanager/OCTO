import { describe, expect, it, vi } from 'vitest';
import {
  OCTO_CONSUMER_GROUP_START_ID,
  ensureConsumerGroups,
  shouldProcessEventIdempotent,
} from '../redis-consumer';

describe('ensureConsumerGroups', () => {
  it('creates groups from the beginning so populated streams are not skipped', async () => {
    const redis = { xgroup: vi.fn().mockResolvedValue('OK'), set: vi.fn() };
    await expect(ensureConsumerGroups(redis)).resolves.toBeUndefined();
    expect(redis.xgroup).toHaveBeenCalled();
    for (const call of redis.xgroup.mock.calls) {
      expect(call[3]).toBe(OCTO_CONSUMER_GROUP_START_ID);
      expect(call[3]).not.toBe('$');
    }
  });

  it('ignores BUSYGROUP errors', async () => {
    const redis = {
      xgroup: vi.fn().mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists')),
      set: vi.fn(),
    };
    await expect(ensureConsumerGroups(redis)).resolves.toBeUndefined();
  });
});

describe('shouldProcessEventIdempotent', () => {
  it('returns true only for first process', async () => {
    const redis = {
      xgroup: vi.fn(),
      set: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null),
    };
    await expect(shouldProcessEventIdempotent(redis, 't1', 'e1')).resolves.toBe(true);
    await expect(shouldProcessEventIdempotent(redis, 't1', 'e1')).resolves.toBe(false);
  });
});
