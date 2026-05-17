import { trace, type Tracer } from '@opentelemetry/api';

export function getTracer(name: string, version?: string): Tracer {
  return trace.getTracer(name, version);
}

export function getOctoTracer(): Tracer {
  return getTracer('octo', '0.0.1-f0');
}
