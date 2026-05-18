// packages/queue/src/instrumented-queue.ts
// Fix 6 — OTel-instrumented wrapper around BullMQ Queue.
//
// Wraps Queue.add() in an OTEL span following the OpenTelemetry
// Messaging Semantic Conventions (messaging.system, messaging.operation,
// messaging.destination.name, messaging.message.id).
//
// Also automatically injects W3C traceparent into job data (Fix 7).
// This means every enqueue becomes a parent span; the worker's
// process span is a child — giving full end-to-end distributed traces.

import { type JobsOptions, Queue } from 'bullmq';
import {
  SpanKind,
  SpanStatusCode,
  type Tracer,
} from '@opentelemetry/api';
import { getOctoTracer } from '@octo/observability';
import { createQueue, type QueueConfig } from './create-queue';
import { injectTraceparent } from './traceparent';
import type { QueueName } from './queue-names';

// BullMQ 5.x tightened Queue<T>.add() to require
// ExtractNameType<T, string> for the job name parameter.
// When T is a plain object (no discriminated name field),
// ExtractNameType resolves to `string` — but only after the
// cast below makes the generic relationship explicit.
type AnyJobData = Record<string, unknown>;

export class InstrumentedQueue<T extends AnyJobData = AnyJobData> {
  private readonly queue: Queue<T & { traceparent?: string }>;
  private readonly tracer: Tracer;
  private readonly queueName: string;

  constructor(name: QueueName | string, config: QueueConfig) {
    this.queue     = createQueue<T & { traceparent?: string }>(name, config);
    this.tracer    = getOctoTracer();
    this.queueName = name;
  }

  /**
   * Enqueue a job with full OTel instrumentation.
   * Automatically injects W3C traceparent into the job data.
   */
  async add(
    jobName: string,
    data: T,
    opts?: JobsOptions,
  ): Promise<string | undefined> {
    return this.tracer.startActiveSpan(
      `${this.queueName} publish`,
      {
        kind: SpanKind.PRODUCER,
        attributes: {
          'messaging.system':            'bullmq',
          'messaging.operation':         'publish',
          'messaging.destination.name':  this.queueName,
          'messaging.message.id':        (data as AnyJobData)['executionId'] as string ?? jobName,
          'octo.job.name':               jobName,
        },
      },
      async (span) => {
        try {
          // Inject active span context as W3C traceparent in job data
          const instrumentedData = injectTraceparent(data);

          // Cast jobName: when T has no discriminated name literal,
          // ExtractNameType<T & { traceparent? }, string> == string.
          // The explicit cast satisfies the BullMQ 5.x overload.
          const job = await this.queue.add(
            jobName as Parameters<typeof this.queue.add>[0],
            instrumentedData,
            opts,
          );

          span.setAttribute('messaging.message.id', job.id ?? jobName);
          span.setStatus({ code: SpanStatusCode.OK });
          return job.id;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  /** Expose underlying queue for BullMQ-specific operations (pause, drain, etc.) */
  get raw(): Queue<T & { traceparent?: string }> {
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

/**
 * Factory function — mirrors createQueue() ergonomics.
 */
export function createInstrumentedQueue<T extends AnyJobData = AnyJobData>(
  name: QueueName | string,
  config: QueueConfig,
): InstrumentedQueue<T> {
  return new InstrumentedQueue<T>(name, config);
}
