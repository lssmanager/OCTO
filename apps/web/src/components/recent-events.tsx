// F0 stub — events will be populated from execution_events table in F1
// Structure matches OctoEventType from F0-002 contracts

interface StubEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
}

const STUB_EVENTS: StubEvent[] = [
  {
    id: 'evt_01',
    type: 'ServiceStarted',
    source: 'runtime-worker',
    timestamp: '—',
  },
  {
    id: 'evt_02',
    type: 'HealthCheck',
    source: 'api:postgres',
    timestamp: '—',
  },
  {
    id: 'evt_03',
    type: 'HealthCheck',
    source: 'api:redis',
    timestamp: '—',
  },
];

export function RecentEvents() {
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Recent Events
        </h2>
        <span
          className="text-xs px-1.5 py-0.5 rounded font-mono"
          style={{
            color: 'var(--color-text-faint)',
            backgroundColor: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
          }}
        >
          F1 stub
        </span>
      </div>

      <div className="space-y-2">
        {STUB_EVENTS.map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-3 py-2 border-b last:border-0"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: 'var(--color-primary)' }}
            />
            <span
              className="text-xs font-mono flex-1 truncate"
              style={{ color: 'var(--color-text)' }}
            >
              {event.type}
            </span>
            <span
              className="text-xs font-mono shrink-0"
              style={{ color: 'var(--color-text-faint)' }}
            >
              {event.source}
            </span>
            <span
              className="text-xs font-mono shrink-0"
              style={{ color: 'var(--color-text-faint)' }}
            >
              {event.timestamp}
            </span>
          </div>
        ))}
      </div>

      <p
        className="text-xs mt-3 font-mono"
        style={{ color: 'var(--color-text-faint)' }}
      >
        Live events connect in F1 via execution_events table
      </p>
    </div>
  );
}
