import type { ServiceHealth } from '@/lib/health';

export function ServiceDetailCard({
  service: _service,
  label,
  data,
}: {
  service: string;
  label: string;
  data: ServiceHealth;
}) {
  const ok = data.status === 'ok';
  const statusColor = ok ? 'var(--color-success)' : 'var(--color-error)';

  const rows: Array<{ key: string; value: string | undefined }> = [
    { key: 'service', value: data.service },
    { key: 'status', value: data.status },
    { key: 'version', value: data.version },
    { key: 'phase', value: data.phase },
    { key: 'latency', value: data.latencyMs !== undefined ? `${data.latencyMs}ms` : undefined },
    { key: 'error', value: data.error },
  ];

  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: ok ? 'var(--color-border)' : 'var(--color-error)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {label}
        </h3>
        <span
          className="text-xs font-mono uppercase font-bold"
          style={{ color: statusColor }}
        >
          {data.status}
        </span>
      </div>

      <div className="space-y-2">
        {rows
          .filter((r) => r.value !== undefined)
          .map(({ key, value }) => (
            <div key={key} className="flex gap-3">
              <span
                className="text-xs w-16 shrink-0 font-mono"
                style={{ color: 'var(--color-text-faint)' }}
              >
                {key}
              </span>
              <span
                className="text-xs font-mono break-all"
                style={{
                  color:
                    key === 'error'
                      ? 'var(--color-error)'
                      : key === 'status'
                      ? statusColor
                      : 'var(--color-text)',
                }}
              >
                {value}
              </span>
            </div>
          ))}
      </div>

      {data.checks && Object.keys(data.checks).length > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>
            Infra Checks
          </p>
          <div className="space-y-1">
            {Object.entries(data.checks).map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-xs font-mono w-20 shrink-0" style={{ color: 'var(--color-text-faint)' }}>
                  {k}
                </span>
                <code className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {JSON.stringify(v)}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
