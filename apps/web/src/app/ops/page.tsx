import { getOpsStatus } from '@/lib/ops';

export const revalidate = 15;

/** Status badge color logic for service health. */
function statusColor(status: string): string {
  switch (status) {
    case 'ok': return '#22c55e';
    case 'degraded': return '#f59e0b';
    case 'error': return '#ef4444';
    default: return '#6b7280';
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: statusColor(status),
        marginRight: 6,
      }}
    />
  );
}

export default async function OpsPage() {
  const result = await getOpsStatus();

  if (result.error || !result.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Ops Console
        </h1>
        <div style={{ color: 'var(--color-text-error)' }}>
          Failed to fetch ops status: {result.error ?? 'Unknown error'}
        </div>
      </div>
    );
  }

  const { data } = result;
  const { build, services, queues } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Ops Console
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Infrastructure status · Revalidates every 15s · {data.timestamp}
        </p>
      </div>

      {/* Build Info */}
      <section>
        <h2 className="text-base font-medium mb-2" style={{ color: 'var(--color-text)' }}>
          Build
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm"
          style={{ color: 'var(--color-text-muted)' }}>
          <div>Version: <strong style={{ color: 'var(--color-text)' }}>{build.version}</strong></div>
          <div>Commit: <strong style={{ color: 'var(--color-text)' }}>{build.commit.slice(0, 7)}</strong></div>
          <div>Phase: <strong style={{ color: 'var(--color-text)' }}>{build.phase}</strong></div>
          <div>Built: <strong style={{ color: 'var(--color-text)' }}>{build.builtAt?.slice(0, 10) ?? '—'}</strong></div>
          <div>Node: <strong style={{ color: 'var(--color-text)' }}>{build.node}</strong></div>
        </div>
      </section>

      {/* Services */}
      <section>
        <h2 className="text-base font-medium mb-2" style={{ color: 'var(--color-text)' }}>
          Services
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(services).map(([name, svc]) => (
            <div
              key={name}
              className="rounded-lg border p-3"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <div className="flex items-center mb-1">
                <StatusBadge status={svc.status} />
                <span className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
                  {name.toUpperCase()}
                </span>
              </div>
              <div className="text-xs space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {name === 'api' && svc.uptime !== undefined && (
                  <div>Uptime: {svc.uptime}s</div>
                )}
                {svc.latencyMs !== undefined && (
                  <div>Latency: {svc.latencyMs}ms</div>
                )}
                {svc.error && (
                  <div style={{ color: 'var(--color-text-error)' }}>{svc.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Queues */}
      <section>
        <h2 className="text-base font-medium mb-2" style={{ color: 'var(--color-text)' }}>
          Queues
        </h2>
        {Object.keys(queues).length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No queue data available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th className="text-left py-1 pr-4" style={{ color: 'var(--color-text-muted)' }}>Queue</th>
                  <th className="text-right py-1 px-2" style={{ color: 'var(--color-text-muted)' }}>Waiting</th>
                  <th className="text-right py-1 px-2" style={{ color: 'var(--color-text-muted)' }}>Active</th>
                  <th className="text-right py-1 px-2" style={{ color: 'var(--color-text-muted)' }}>Completed</th>
                  <th className="text-right py-1 px-2" style={{ color: 'var(--color-text-muted)' }}>Failed</th>
                  <th className="text-right py-1 pl-2" style={{ color: 'var(--color-text-muted)' }}>Delayed</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(queues).map(([name, stats]) => (
                  <tr key={name} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td className="py-1 pr-4 font-mono text-xs" style={{ color: 'var(--color-text)' }}>{name}</td>
                    <td className="text-right py-1 px-2" style={{ color: 'var(--color-text-muted)' }}>{stats.waiting}</td>
                    <td className="text-right py-1 px-2" style={{ color: 'var(--color-text)' }}>{stats.active}</td>
                    <td className="text-right py-1 px-2" style={{ color: 'var(--color-text-muted)' }}>{stats.completed}</td>
                    <td className="text-right py-1 px-2" style={{ color: stats.failed > 0 ? 'var(--color-text-error)' : 'var(--color-text-muted)' }}>{stats.failed}</td>
                    <td className="text-right py-1 pl-2" style={{ color: 'var(--color-text-muted)' }}>{stats.delayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
