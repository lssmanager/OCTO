import { notFound } from 'next/navigation';
import { SystemStatus } from '@/components/system-status';
import { PhaseProgress } from '@/components/phase-progress';
import { RecentEvents } from '@/components/recent-events';
import { getSystemHealth } from '@/lib/health';
import { hasDashboardAccess } from '@/lib/dashboard-access';

export const revalidate = 30;

export default async function StatusPage() {
  if (!(await hasDashboardAccess())) {
    notFound();
  }

  const health = await getSystemHealth();

  const overallOk = health.api.status === 'ok' && health.runtime.status === 'ok';

  return (
    <div className="space-y-6">
      {/* Overall status banner */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg border"
        style={{
          borderColor: overallOk ? 'var(--color-success)' : 'var(--color-error)',
          backgroundColor: overallOk ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
        }}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
          style={{
            backgroundColor: overallOk ? 'var(--color-success)' : 'var(--color-error)',
          }}
        />
        <span className="font-semibold text-sm tracking-wide uppercase">
          {overallOk ? 'All Systems Operational' : 'Degraded — Check Services'}
        </span>
      </div>

      {/* Service groups */}
      <SystemStatus health={health} />

      {/* Phase + Events row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PhaseProgress />
        <RecentEvents />
      </div>
    </div>
  );
}
