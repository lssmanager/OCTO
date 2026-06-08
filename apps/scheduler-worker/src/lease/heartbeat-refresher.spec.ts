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

  it('converts lease-loss callback exceptions into observable state instead of escaping', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refresher = new HeartbeatRefresher(
      { refreshHeartbeat: vi.fn().mockResolvedValue(0) },
      'exec-1',
      'worker-1',
      () => {
        throw new Error('callback exploded');
      }
    );

    await expect((refresher as any).refresh()).resolves.toBeUndefined();

    expect(refresher.getLastError()).toBeInstanceOf(HeartbeatLostError);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
