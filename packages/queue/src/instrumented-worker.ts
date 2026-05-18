// packages/queue/src/instrumented-worker.ts
// Fix 6 — OTel-instrumented wrapper around BullMQ Worker (dequeue/process side).
//
// Restores the distributed trace context from job.data.traceparent (Fix 7),
// then wraps the user-supplied processor in a child OTEL span.
// This makes every job processing span a child of the enqueue span,
// giving end-to-end traces: HTTP request → enqueue → worker process → Python worker.
//
// Span attributes follow OTel Messaging Semantic Conventions.

import { Worker, type Processor, type Job } from 'bullmq';
import {
  SpanKind,
  SpanStatusCode,
  type Tracer,
} from '@opentelemetry/api';
import { getOctoTracer } from '@octo/observability';
import { createWorker, type WorkerConfig } from './create-worker';
import { extractTraceparent } from './traceparent';
import type { QueueName } from './queue-names';

export type InstrumentedProcessor<T, R> = (
  job: Job<T, R>,
) => Promise<R>;

/**
 * Creates a BullMQ Worker with:
 * 1. OTel span wrapping every job processor call
 * 2. Trace context restoration from W3C traceparent in job data
 * 3. Graceful shutdown (inherited from createWorker)
 *
 * @example
 * const worker = createInstrumentedWorker(
 *   'octo:execution',
 *   async (job) => {
 *     // job.data is typed, active span is a child of the enqueue span
 *     await processExecution(job.data);
 *   },
 *   { redisUrl: process.env.REDIS_URL },
 * );
 */
export function createInstrumentedWorker<
  T extends { traceparent?: string },
  R = void,
>(
  name: QueueName | string,
  processor: InstrumentedProcessor<T, R>,
  config: WorkerConfig,
): Worker<T, R> {
  const tracer: Tracer = getOctoTracer();

  const instrumentedProcessor: Processor<T, R> = async (job: Job<T, R>): Promise<R> => {
    // Restore distributed trace context from W3C traceparent embedded in job data
    const parentCtx = extractTraceparent(job.data as { traceparent?: string });

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
          'octo.execution.id':          (job.data as Record<string, unknown>)['executionId'] as string ?? 'none',
          'octo.trace.id':              (job.data as Record<string, unknown>)['traceId']     as string ?? 'none',
        },
      },
      parentCtx,
      async (span) => {
        try {
          const result = await processor(job);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          // Re-throw so BullMQ can retry based on job's attempts config
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };

  return createWorker<T, R>(name, instrumentedProcessor, config);
}
