import { notFound } from 'next/navigation';
import { getVersionInfo } from '@/lib/health';
import { hasDashboardAccess } from '@/lib/dashboard-access';

export const revalidate = 60;

export default async function VersionPage() {
  if (!(await hasDashboardAccess())) {
    notFound();
  }

  const info = await getVersionInfo();

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Version', value: info.version ?? 'unknown' },
    { label: 'Phase', value: info.phase ?? 'unknown' },
    { label: 'Git Commit', value: info.commit ?? 'unknown' },
    { label: 'Build Time', value: info.buildTime ?? 'unknown' },
    { label: 'Node Env', value: info.nodeEnv ?? 'unknown' },
    { label: 'API URL', value: info.apiUrl ?? 'unknown' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Build Information
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Runtime configuration and deployment metadata.
        </p>
      </div>

      <div
        className="rounded-lg border divide-y"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          // @ts-expect-error CSS variable
          '--tw-divide-opacity': '1',
        }}
      >
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center px-4 py-3 gap-4">
            <span
              className="w-32 text-xs font-medium uppercase tracking-wider shrink-0"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {label}
            </span>
            <code
              className="text-sm font-mono"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
            >
              {value}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
