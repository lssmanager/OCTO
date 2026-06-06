import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    service: 'octo-web',
    status: 'ok',
    phase: process.env['BUILD_PHASE'] ?? 'F1',
    version: process.env['BUILD_VERSION'] ?? '0.1.0-f1',
    commit: process.env['BUILD_COMMIT'] ?? 'local',
    built_at: process.env['BUILD_TIME'] ?? 'local',
    publicSurface: 'web+api',
  });
}
