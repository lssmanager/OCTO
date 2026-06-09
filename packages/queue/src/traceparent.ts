// packages/queue/src/traceparent.ts
// W3C traceparent injection/extraction for BullMQ job payloads.
//
// Why W3C traceparent (not baggage, not custom headers):
// BullMQ job data is serialized JSON stored in Redis. There's no HTTP header
// envelope. We embed the trace context directly in the job payload under the
// canonical keys 'traceparent' and 'tracestate'. Python workers read those
// fields and call TraceContextTextMapPropagator().extract() to continue the
// distributed trace.
//
// Format: 00-<trace-id-32hex>-<parent-id-16hex>-<flags-2hex>
// Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01

import { context, propagation, trace, type Context } from '@opentelemetry/api';

// The single canonical definition of the W3C trace fields used in queue payloads.
export interface WithTraceparent {
  traceparent?: string;
  tracestate?: string;
}

/**
 * Injects the active OTel context into a job data object as W3C trace fields.
 * T is constrained to already include traceparent?/tracestate? — no intersection needed.
 * Returns T so callers see a clean, non-intersected type.
 */
export function injectTraceparent<T extends WithTraceparent>(data: T): T {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  if (carrier['traceparent']) {
    (data as Record<string, unknown>)['traceparent'] = carrier['traceparent'];
  }
  if (carrier['tracestate']) {
    (data as Record<string, unknown>)['tracestate'] = carrier['tracestate'];
  }

  // No active span (e.g. test env without SDK) — return data unchanged.
  return data;
}

/**
 * Extracts the OTel context from a job payload's W3C trace fields.
 * Returns a Context that can be used to start a child span in the consumer.
 */
export function extractTraceparent(data: WithTraceparent): Context {
  if (!data.traceparent) {
    // No traceparent — return root context (no-op, span becomes a new root).
    return context.active();
  }

  const carrier: Record<string, string> = {
    traceparent: data.traceparent,
    ...(data.tracestate ? { tracestate: data.tracestate } : {}),
  };
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
  traceparent: string
): { version: string; traceId: string; parentId: string; flags: string } | null {
  const parts = traceparent.split('-');
  if (parts.length !== 4) return null;
  const [version, traceId, parentId, flags] = parts;
  if (!version || !traceId || !parentId || !flags) return null;
  return { version, traceId, parentId, flags };
}

// Re-export for convenience — Python worker docs reference these
export { trace, context, propagation };
