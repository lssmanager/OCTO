/**
 * packages/queue/src/trace-carrier.ts
 * H7 — Trace Continuity Across Queue Boundary
 *
 * PROBLEM:
 *   When an execution is enqueued into BullMQ, the HTTP request trace context
 *   (traceparent / tracestate W3C headers) is lost unless explicitly serialized
 *   into the job payload. The Python runtime-worker picks up the job with no
 *   trace context, creating a disconnected waterfall in Grafana.
 *
 * SOLUTION:
 *   At enqueue time:  injectTraceContext(payload) adds _traceparent/_tracestate
 *   At worker pickup: extractTraceContext(job.data) returns the carrier
 *   Python side:      trace_context.py calls extract(carrier) to resume the span
 *
 * GRAFANA WATERFALL (target):
 *   HTTP POST /executions
 *     └─ enqueue span (NestJS)
 *          └─ BullMQ consumer span (scheduler-worker)
 *               └─ runtime execution span (Python worker)
 *                    └─ tool invocation spans
 *   All under ONE trace_id.
 */

export interface TraceCarrier {
  readonly _traceparent?: string; // W3C traceparent: "00-traceId-spanId-flags"
  readonly _tracestate?:  string; // W3C tracestate: vendor-specific
}

/**
 * injectTraceContext — call at enqueue time inside the NestJS control plane.
 *
 * Usage:
 *   const payload = injectTraceContext({
 *     executionId,
 *     agentId,
 *     task,
 *   });
 *   await queue.add('run-execution', payload);
 */
export function injectTraceContext<T extends Record<string, unknown>>(
  payload:     T,
  traceparent?: string,
  tracestate?:  string,
): T & TraceCarrier {
  return {
    ...payload,
    ...(traceparent ? { _traceparent: traceparent } : {}),
    ...(tracestate  ? { _tracestate:  tracestate  } : {}),
  };
}

/**
 * extractTraceContext — call at BullMQ worker pickup.
 *
 * Returns the carrier for OTel propagation.extract().
 * Returns empty carrier if no trace headers present (cold start / tests).
 */
export function extractTraceContext(jobData: Record<string, unknown>): TraceCarrier {
  return {
    _traceparent: typeof jobData['_traceparent'] === 'string' ? jobData['_traceparent'] : undefined,
    _tracestate:  typeof jobData['_tracestate']  === 'string' ? jobData['_tracestate']  : undefined,
  };
}
