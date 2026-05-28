/**
 * packages/queue/src/otel-propagation.ts
 * Issue #37 — OTEL Trace Continuity Through BullMQ Payloads
 *
 * Canonical helpers for injecting and extracting W3C trace context
 * across the BullMQ queue boundary. This is the single source of truth
 * for distributed trace propagation in OCTO.
 *
 * PROBLEM:
 *   HTTP spans created by NestJS auto-instrumentation live in the Node.js
 *   AsyncLocalStorage context. When a job is serialized to Redis JSON and
 *   picked up by a different process (worker), that context is lost.
 *   Without explicit propagation, each worker starts a new root span —
 *   creating disconnected waterfalls in Grafana / Jaeger.
 *
 * SOLUTION:
 *   Producer (enqueue): propagation.inject() serializes the active context
 *   into the job payload as W3C traceparent + tracestate strings.
 *
 *   Consumer (worker): propagation.extract() deserializes those strings back
 *   into an OTEL Context, which is used as the parent for all worker spans.
 *
 * RESULT (Grafana waterfall):
 *   POST /api/executions          [HTTP]     traceId: abc123
 *     └─ octo:execution publish   [PRODUCER] traceId: abc123  ← same
 *          └─ octo:execution process [CONSUMER] traceId: abc123 ← same
 *               └─ execution.reclaim.cas [INTERNAL] traceId: abc123 ← same
 *
 * CARRIER FORMAT in job payload:
 *   {
 *     executionId: "...",
 *     traceparent:    "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
 *     tracestate:     "rojo=00f067aa0ba902b7,congo=t61rcWkgMzE",  // optional
 *     correlationId:  "corr-01JXXXXXX",
 *     spanId:         "00f067aa0ba902b7",
 *   }
 *
 * WHY NOT _traceparent (underscore prefix)?
 *   The underscore convention was used in trace-carrier.ts but conflicts with
 *   the W3C TextMapPropagator convention which uses bare 'traceparent' as the
 *   canonical key. instrumented-worker.ts already reads 'traceparent' (no
 *   underscore). This file standardises on the W3C key.
 */

import { context, propagation, trace, type Context } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

/** Fields injected into every BullMQ job payload for trace continuity. */
export interface OtelTraceFields {
  /** W3C traceparent: '00-<traceId>-<spanId>-<flags>' */
  traceparent?: string;
  /** W3C tracestate: vendor-specific key=value pairs */
  tracestate?: string;
  /** Monotonic correlation ID for log/event correlation independent of OTEL */
  correlationId?: string;
  /** spanId of the enqueue span — convenience for log queries */
  spanId?: string;
}

/**
 * injectOtelContext — call at enqueue time (producer side).
 *
 * Serializes the active OTEL context (traceparent + tracestate) into the
 * job payload. Also generates a correlationId if not already present.
 *
 * @example (NestJS service / queue producer):
 *   const payload = injectOtelContext({
 *     executionId,
 *     agentId,
 *     task,
 *   });
 *   await queue.add('execute', payload);
 */
export function injectOtelContext<T extends Record<string, unknown>>(
  payload: T
): T & OtelTraceFields {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  const activeSpan = trace.getActiveSpan();
  const spanId = activeSpan?.spanContext().spanId;

  return {
    ...payload,
    ...(carrier['traceparent'] ? { traceparent: carrier['traceparent'] } : {}),
    ...(carrier['tracestate'] ? { tracestate: carrier['tracestate'] } : {}),
    correlationId: (payload['correlationId'] as string | undefined) ?? `corr-${randomUUID()}`,
    ...(spanId ? { spanId } : {}),
  };
}

/**
 * extractOtelContext — call at BullMQ worker pickup (consumer side).
 *
 * Deserializes traceparent + tracestate from the job payload back into
 * an OTEL Context. Use this context as the parent when starting worker spans.
 *
 * Returns the active context unchanged if no traceparent is present
 * (e.g. in tests without the OTEL SDK initialized).
 *
 * @example (BullMQ worker processor):
 *   const parentCtx = extractOtelContext(job.data);
 *   return context.with(parentCtx, async () => {
 *     const span = tracer.startSpan('execution.process', {}, parentCtx);
 *     try {
 *       await processExecution(job.data);
 *       span.setStatus({ code: SpanStatusCode.OK });
 *     } finally {
 *       span.end();
 *     }
 *   });
 */
export function extractOtelContext(jobData: OtelTraceFields): Context {
  if (!jobData.traceparent) {
    return context.active();
  }

  const carrier: Record<string, string> = {
    traceparent: jobData.traceparent,
    ...(jobData.tracestate ? { tracestate: jobData.tracestate } : {}),
  };

  return propagation.extract(context.active(), carrier);
}

/**
 * generateCorrelationId — generates a unique correlation ID.
 * Independent of OTEL — works even when the SDK is not initialized.
 */
export function generateCorrelationId(): string {
  return `corr-${randomUUID()}`;
}
