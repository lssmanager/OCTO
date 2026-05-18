// packages/queue/src/instrumented-queue.ts
// OTel-instrumented wrapper around BullMQ Queue.
//
// BullMQ 5.x introduced strict ExtractNameType / ExtractDataType utility
// types on Queue<T>.add(). When T is a generic that gets intersected with
// WithTraceparent, TypeScript cannot prove T & WithTraceparent is assignable
// to ExtractDataType<T & { traceparent? }, T & { traceparent? }>.
//
// Solution: the internal BullMQ Queue instance is typed as Queue<AnyJobData>
// (i.e. Record<string, unknown>). This is always assignable to BullMQ's
// internal constraints. The public API of InstrumentedQueue<T> preserves
// the caller's generic — the cast is contained inside this file.

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJobData = Record<string, any>;

export class InstrumentedQueue<T extends AnyJobData = AnyJobData> {
  // Typed as AnyJobData internally to satisfy BullMQ 5.x ExtractDataType.
  // The public add() method still exposes T for callers.
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
          // Inject active span context as W3C traceparent in job data.
          // injectTraceparent returns T & WithTraceparent; cast to AnyJobData
          // for the internal queue.add() call.
          const instrumentedData = injectTraceparent(data) as AnyJobData;
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

  /** Expose underlying queue for BullMQ-specific operations (pause, drain, etc.) */
  get raw(): Queue<AnyJobData> {
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
