// packages/queue/src/traceparent.ts
// Fix 7 — W3C traceparent injection/extraction for BullMQ job payloads.
//
// Why W3C traceparent (not baggage, not custom headers):
// BullMQ job data is serialized JSON stored in Redis. There's no HTTP header
// envelope. We embed the traceparent string directly in the job payload under
// the key 'traceparent'. Python workers read job.data['traceparent'] and call
// TraceContextTextMapPropagator().extract() to continue the distributed trace.
//
// Format: 00-<trace-id-32hex>-<parent-id-16hex>-<flags-2hex>
// Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01

import {
  context,
  propagation,
  trace,
  type Context,
} from '@opentelemetry/api';

export interface WithTraceparent {
  traceparent?: string;
}

/**
 * Injects the active OTel context into a job data object as a W3C traceparent.
 * Call this in the producer (enqueue side) just before queue.add().
 *
 * @example
 * const jobData = injectTraceparent({ executionId, agentId, traceId, ... });
 * await queue.add('execute', jobData);
 */
export function injectTraceparent<T extends object>(data: T): T & WithTraceparent {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  if (carrier['traceparent']) {
    return { ...data, traceparent: carrier['traceparent'] };
  }

  // No active span (e.g. test env without SDK) — return data unchanged.
  return data as T & WithTraceparent;
}

/**
 * Extracts the OTel context from a job payload's traceparent field.
 * Returns a Context that can be used to start a child span in the consumer.
 *
 * @example
 * const ctx = extractTraceparent(job.data);
 * return tracer.startActiveSpan('worker.process', {}, ctx, async (span) => {
 *   // ... process job
 *   span.end();
 * });
 */
export function extractTraceparent(data: WithTraceparent): Context {
  if (!data.traceparent) {
    // No traceparent — return root context (no-op, span becomes a new root).
    return context.active();
  }

  const carrier: Record<string, string> = { traceparent: data.traceparent };
  return propagation.extract(context.active(), carrier);
}

/**
 * Formats a trace context as a W3C traceparent string.
 * Useful for logging and for embedding in Python worker responses.
 */
export function formatTraceparent(traceId: string, spanId: string, flags = '01'): string {
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Parses a W3C traceparent string into its components.
 * Returns null if the format is invalid.
 */
export function parseTraceparent(
  traceparent: string,
): { version: string; traceId: string; parentId: string; flags: string } | null {
  const parts = traceparent.split('-');
  if (parts.length !== 4) return null;
  const [version, traceId, parentId, flags] = parts;
  if (!version || !traceId || !parentId || !flags) return null;
  return { version, traceId, parentId, flags };
}

// Re-export for convenience — Python worker docs reference these
export { trace, context, propagation };
