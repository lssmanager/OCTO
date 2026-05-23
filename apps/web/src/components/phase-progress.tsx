const PHASES = [
  { id: 'F0', label: 'F0 — Foundation Platform', progress: 100, done: true },
  { id: 'F1', label: 'F1 — Agent Execution', progress: 0, done: false },
  { id: 'F2', label: 'F2 — LangGraph Runtime', progress: 0, done: false },
  { id: 'F3', label: 'F3 — Tool System', progress: 0, done: false },
  { id: 'F4', label: 'F4 — Memory System', progress: 0, done: false },
  { id: 'F5', label: 'F5 — Multi-Agent', progress: 0, done: false },
  { id: 'F6', label: 'F6 — Full GUI', progress: 0, done: false },
] as const;

export function PhaseProgress() {
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Phase Roadmap
      </h2>

      <div className="space-y-3">
        {PHASES.map((phase) => (
          <div key={phase.id}>
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-xs font-mono"
                style={{
                  color: phase.done ? 'var(--color-success)' : 'var(--color-text-muted)',
                }}
              >
                {phase.label}
              </span>
              <span
                className="text-xs font-mono"
                style={{
                  color: phase.done ? 'var(--color-success)' : 'var(--color-text-faint)',
                }}
              >
                {phase.done ? '✓ 100%' : '0%'}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--color-border)' }}
              role="progressbar"
              aria-valuenow={phase.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${phase.label} progress`}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${phase.progress}%`,
                  backgroundColor: phase.done ? 'var(--color-success)' : 'var(--color-primary)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
