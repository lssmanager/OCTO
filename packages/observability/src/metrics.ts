// Metrics stub — integrate with Prometheus/OTEL metrics
export interface MetricsCounter {
  increment(labels?: Record<string, string>): void;
}

export interface MetricsHistogram {
  record(value: number, labels?: Record<string, string>): void;
}

// Placeholder until OpenTelemetry metrics SDK is wired up
export const noopCounter: MetricsCounter = { increment: () => undefined };
export const noopHistogram: MetricsHistogram = { record: () => undefined };
