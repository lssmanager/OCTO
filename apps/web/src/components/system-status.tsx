import type { SystemHealthData, ServiceHealth } from '@/lib/health';

function ServiceCard({
  label,
  sublabel,
  health,
}: {
  label: string;
  sublabel: string | undefined;
  health: ServiceHealth;
}) {
  const ok = health.status === 'ok';
  const color = ok ? 'var(--color-success)' : 'var(--color-error)';

  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {label}
          </span>
        </div>
        <span
          className="text-xs font-mono uppercase font-semibold"
          style={{ color }}
        >
          {health.status}
        </span>
      </div>

      {sublabel && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {sublabel}
        </p>
      )}

      {health.latencyMs !== undefined && (
        <p className="text-xs font-mono" style={{ color: 'var(--color-text-faint)' }}>
          {health.latencyMs}ms
        </p>
      )}

      {health.error && (
        <p
          className="text-xs mt-1 font-mono break-all"
          style={{ color: 'var(--color-error)' }}
        >
          {health.error}
        </p>
      )}

      {health.phase && (
        <p className="text-xs mt-1 font-mono" style={{ color: 'var(--color-text-faint)' }}>
          phase: {health.phase}
        </p>
      )}
    </div>
  );
}

// Infrastructure services parsed from API health checks
function InfraCard({
  label,
  status,
  latency,
}: {
  label: string;
  status: 'ok' | 'error' | 'unknown';
  latency: string | undefined;
}) {
  const color =
    status === 'ok'
      ? 'var(--color-success)'
      : status === 'error'
      ? 'var(--color-error)'
      : 'var(--color-text-faint)';

  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {label}
          </span>
        </div>
        <span className="text-xs font-mono uppercase font-semibold" style={{ color }}>
          {status}
        </span>
      </div>
      {latency && (
        <p className="text-xs font-mono" style={{ color: 'var(--color-text-faint)' }}>
          {latency}
        </p>
      )}
    </div>
  );
}

export function SystemStatus({ health }: { health: SystemHealthData }) {
  // Parse infra checks from API health response
  const apiChecks = health.api.checks ?? {};
  const postgres = (apiChecks['postgres'] as { status?: string; latencyMs?: number } | undefined);
  const redis = (apiChecks['redis'] as { status?: string; latencyMs?: number } | undefined);
  const queue = (apiChecks['queue'] as { status?: string } | undefined);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
        Services
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Control Plane */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
            Control Plane
          </p>
          <ServiceCard
            label="API"
            sublabel={health.api.service}
            health={health.api}
          />
        </div>

        {/* Execution Plane */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
            Execution Plane
          </p>
          <ServiceCard
            label="Runtime Worker"
            sublabel={health.runtime.service}
            health={health.runtime}
          />
        </div>

        {/* Infrastructure */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
            Infrastructure
          </p>
          <div className="space-y-2">
            <InfraCard
              label="PostgreSQL"
              status={
                postgres?.status === 'ok'
                  ? 'ok'
                  : health.api.status === 'error'
                  ? 'unknown'
                  : postgres?.status === 'error'
                  ? 'error'
                  : 'unknown'
              }
              latency={
                postgres?.latencyMs !== undefined
                  ? `${postgres.latencyMs}ms`
                  : undefined
              }
            />
            <InfraCard
              label="Redis"
              status={
                redis?.status === 'ok'
                  ? 'ok'
                  : health.api.status === 'error'
                  ? 'unknown'
                  : redis?.status === 'error'
                  ? 'error'
                  : 'unknown'
              }
              latency={
                redis?.latencyMs !== undefined ? `${redis.latencyMs}ms` : undefined
              }
            />
            <InfraCard
              label="Queue (BullMQ)"
              latency={undefined}
              status={
                queue?.status === 'ok'
                  ? 'ok'
                  : health.api.status === 'error'
                  ? 'unknown'
                  : queue?.status === 'error'
                  ? 'error'
                  : 'unknown'
              }
            />
          </div>
        </div>
      </div>

      {/* Fetched at */}
      <p className="text-xs font-mono" style={{ color: 'var(--color-text-faint)' }}>
        Last updated: {health.fetchedAt} · Revalidates every 30s
      </p>
    </div>
  );
}





