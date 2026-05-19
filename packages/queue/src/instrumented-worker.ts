// packages/queue/src/instrumented-worker.ts
// Issue #37 — OTel-instrumented BullMQ Worker wrapper.
// Uses extractOtelContext() to restore W3C trace context from job payload.

import { Worker, type Processor, type Job } from 'bullmq';
import { SpanKind, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import { getOctoTracer } from '@octo/observability';
import { createWorker, type WorkerConfig } from './create-worker';
import { extractOtelContext, type OtelTraceFields } from './otel-propagation';
import type { QueueName } from './queue-names';

export type InstrumentedProcessor<T, R> = (job: Job<T, R>) => Promise<R>;

/**
 * Creates a BullMQ Worker with full OTel trace continuity.
 *
 * Every job processor call:
 *   1. Extracts W3C traceparent from job.data via extractOtelContext()
 *   2. Starts a CONSUMER span as a child of the producer (enqueue) span
 *   3. Wraps the user processor inside context.with(parentCtx, ...)
 *   4. Records exceptions and sets span status automatically
 *
 * This ensures all worker spans are children of the HTTP request span —
 * one continuous trace from API → queue → worker in Grafana / Jaeger.
 */
export function createInstrumentedWorker<
  T extends OtelTraceFields,
  R = void,
>(
  name: QueueName | string,
  processor: InstrumentedProcessor<T, R>,
  config: WorkerConfig,
): Worker<T, R> {
  const tracer: Tracer = getOctoTracer();

  const instrumentedProcessor: Processor<T, R> = async (job: Job<T, R>): Promise<R> => {
    // Restore the distributed trace context from W3C traceparent in job payload
    const parentCtx = extractOtelContext(job.data as OtelTraceFields);

    return tracer.startActiveSpan(
      `${name} process`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system':           'bullmq',
          'messaging.operation':        'process',
          'messaging.destination.name': name,
          'messaging.message.id':       job.id ?? 'unknown',
          'octo.job.name':              job.name,
          'octo.job.attempts':          job.attemptsMade,
          'octo.execution.id': (job.data as Record<string, unknown>)['executionId'] as string ?? 'none',
          'octo.correlation.id': (job.data as OtelTraceFields).correlationId ?? 'none',
          'octo.span.id':        (job.data as OtelTraceFields).spanId         ?? 'none',
        },
      },
      parentCtx, // ← parent context from producer span
      async (span) => {
        try {
          const result = await processor(job);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };

  return createWorker<T, R>(name, instrumentedProcessor, config);
}
