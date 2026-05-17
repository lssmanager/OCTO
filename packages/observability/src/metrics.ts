export interface MetricsCounter {
  increment(labels?: Record<string, string>): void;
}

export interface MetricsHistogram {
  record(value: number, labels?: Record<string, string>): void;
}

export const noopCounter: MetricsCounter = { increment: () => undefined };
export const noopHistogram: MetricsHistogram = { record: () => undefined };
