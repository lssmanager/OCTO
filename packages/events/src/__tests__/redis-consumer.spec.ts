import { describe, expect, it, vi } from 'vitest';
import { ensureConsumerGroups, shouldProcessEventIdempotent } from '../redis-consumer';

describe('ensureConsumerGroups', () => {
  it('ignores BUSYGROUP errors', async () => {
    const busygroupError = Object.assign(new Error('BUSYGROUP Consumer Group name already exists'), { code: 'BUSYGROUP' });
    const redis = { xgroup: vi.fn().mockRejectedValue(busygroupError), set: vi.fn() };
    await expect(ensureConsumerGroups(redis)).resolves.toBeUndefined();
  });
});

describe('shouldProcessEventIdempotent', () => {
  it('returns true only for first process', async () => {
    const redis = { xgroup: vi.fn(), set: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null) };
    await expect(shouldProcessEventIdempotent(redis, 't1', 'e1')).resolves.toBe(true);
    await expect(shouldProcessEventIdempotent(redis, 't1', 'e1')).resolves.toBe(false);
  });
});
