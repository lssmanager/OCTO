import { describe, expect, it, vi, afterEach } from 'vitest';

const headersMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

async function loadModule() {
  vi.resetModules();
  return import('./dashboard-access');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('hasDashboardAccess', () => {
  it('keeps the F1 web surface public when no dashboard token is configured', async () => {
    vi.stubEnv('DASHBOARD_TOKEN', '');
    headersMock.mockResolvedValue(new Headers());

    const { hasDashboardAccess } = await loadModule();

    await expect(hasDashboardAccess()).resolves.toBe(true);
  });

  it('requires the dashboard token header when a dashboard token is configured', async () => {
    vi.stubEnv('DASHBOARD_TOKEN', 'secret-dashboard-token');
    headersMock.mockResolvedValue(new Headers([['x-dashboard-token', 'wrong-token']]));

    const { hasDashboardAccess } = await loadModule();

    await expect(hasDashboardAccess()).resolves.toBe(false);
  });

  it('accepts the configured dashboard token header', async () => {
    vi.stubEnv('DASHBOARD_TOKEN', 'secret-dashboard-token');
    headersMock.mockResolvedValue(new Headers([['x-dashboard-token', 'secret-dashboard-token']]));

    const { hasDashboardAccess } = await loadModule();

    await expect(hasDashboardAccess()).resolves.toBe(true);
  });
});
