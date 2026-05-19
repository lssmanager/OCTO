// packages/queue/src/instrumented-queue.ts
// Issue #37 — OTel-instrumented BullMQ Queue wrapper.
// Uses injectOtelContext() to propagate W3C traceparent into job payload.

import { type JobsOptions, Queue } from 'bullmq';
import { SpanKind, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import { getOctoTracer } from '@octo/observability';
import { createQueue, type QueueConfig } from './create-queue';
import { injectOtelContext, type OtelTraceFields } from './otel-propagation';
import type { QueueName } from './queue-names';

 
type AnyJobData = Record<string, any>;

export class InstrumentedQueue<T extends OtelTraceFields = AnyJobData> {
  private readonly queue: Queue<AnyJobData>;
  private readonly tracer: Tracer;
  private readonly queueName: string;

  constructor(name: QueueName | string, config: QueueConfig) {
    this.queue     = createQueue<AnyJobData>(name, config);
    this.tracer    = getOctoTracer();
    this.queueName = name;
  }

  /**
   * Enqueue a job with full OTel instrumentation.
   * Automatically injects W3C traceparent + tracestate + correlationId.
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
          'octo.correlation.id':         (data as AnyJobData)['correlationId'] as string ?? '',
        },
      },
      async (span) => {
        try {
          // injectOtelContext reads propagation.inject() AFTER the span starts,
          // so the traceparent captured is this span's ID — correct parent for worker.
          const instrumentedData: AnyJobData = injectOtelContext(data as AnyJobData);
          const job = await this.queue.add(jobName, instrumentedData, opts);

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

  get raw(): Queue<AnyJobData> { return this.queue; }
  async close(): Promise<void> { await this.queue.close(); }
}

export function createInstrumentedQueue<T extends OtelTraceFields = AnyJobData>(
  name: QueueName | string,
  config: QueueConfig,
): InstrumentedQueue<T> {
  return new InstrumentedQueue<T>(name, config);
}
