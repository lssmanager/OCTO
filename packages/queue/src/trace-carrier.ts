/**
 * packages/queue/src/trace-carrier.ts
 * Issue #37 — Trace Continuity (aligned to W3C traceparent key convention)
 *
 * BREAKING CHANGE from previous version:
 *   Carrier keys changed from '_traceparent'/'_tracestate' (underscore prefix)
 *   to 'traceparent'/'tracestate' (W3C standard, no prefix).
 *
 *   Reason: instrumented-worker.ts reads job.data.traceparent (no underscore).
 *   The W3C TextMapPropagator canonical key is 'traceparent'.
 *   Using _traceparent caused a silent mismatch where the worker found no
 *   trace context and started a new root span instead of continuing the trace.
 *
 * NOTE: For new code, prefer otel-propagation.ts (injectOtelContext /
 * extractOtelContext) which handles inject/extract via propagation API directly.
 * This file is kept for backward compatibility with existing callsites.
 */

export interface TraceCarrier {
  readonly traceparent?: string; // W3C traceparent: '00-traceId-spanId-flags'
  readonly tracestate?: string; // W3C tracestate: vendor-specific
}

/**
 * injectTraceContext — call at enqueue time inside the NestJS control plane.
 * Prefer injectOtelContext() from otel-propagation.ts for new code.
 */
export function injectTraceContext<T extends Record<string, unknown>>(
  payload: T,
  traceparent?: string,
  tracestate?: string
): T & TraceCarrier {
  return {
    ...payload,
    ...(traceparent ? { traceparent } : {}),
    ...(tracestate ? { tracestate } : {}),
  };
}

/**
 * extractTraceContext — call at BullMQ worker pickup.
 * Prefer extractOtelContext() from otel-propagation.ts for new code.
 */
export function extractTraceContext(jobData: Record<string, unknown>): TraceCarrier {
  return {
    traceparent: typeof jobData['traceparent'] === 'string' ? jobData['traceparent'] : undefined,
    tracestate: typeof jobData['tracestate'] === 'string' ? jobData['tracestate'] : undefined,
  };
}
