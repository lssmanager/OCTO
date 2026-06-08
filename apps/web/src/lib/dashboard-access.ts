import { headers } from 'next/headers';

const DASHBOARD_TOKEN_HEADER = 'x-dashboard-token';

export async function hasDashboardAccess(): Promise<boolean> {
  const requiredToken = process.env['DASHBOARD_TOKEN'];
  if (!requiredToken) {
    return true;
  }

  const requestHeaders = await headers();
  const providedToken = requestHeaders.get(DASHBOARD_TOKEN_HEADER);

  return providedToken === requiredToken;
}
