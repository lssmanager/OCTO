import { describe, expect, it, vi } from 'vitest';

import { HeartbeatLostError, HeartbeatRefresher } from './heartbeat-refresher';

describe('HeartbeatRefresher', () => {
  it('captures lease loss without throwing from the interval callback', async () => {
    const onLeaseLost = vi.fn();
    const refresher = new HeartbeatRefresher(
      {
        refreshHeartbeat: vi.fn().mockResolvedValue(0),
      },
      'exec-1',
      'worker-1',
      onLeaseLost
    );

    await (refresher as any).refresh();

    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    expect(onLeaseLost.mock.calls[0]?.[0]).toBeInstanceOf(HeartbeatLostError);
    expect(refresher.getLastError()).toBeInstanceOf(HeartbeatLostError);
  });
});
