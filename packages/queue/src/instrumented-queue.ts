// packages/queue/src/instrumented-queue.ts
// OTel-instrumented wrapper around BullMQ Queue.
//
// BullMQ 5.x introduced strict ExtractNameType / ExtractDataType utility
// types on Queue<T>.add(). When the Queue is parametrized with an intersection
// (e.g. Queue<T & WithTraceparent>), the DTS worker of tsup/tsc cannot resolve
// ExtractDataType over that intersected type and raises TS2345.
//
// Three-part fix:
//   1. Internal Queue is Queue<AnyJobData> — decouples the public generic T
//      from BullMQ's internal type machinery. No intersection on the Queue
//      parameter ever reaches ExtractDataType.
//   2. T extends WithTraceparent as the class constraint — traceparent? lives
//      in T's definition, not as a runtime intersection. One canonical place.
//   3. injectTraceparent<T extends WithTraceparent>(data: T): T — returns T
//      directly (no T & WithTraceparent). Cast to AnyJobData is a single,
//      contained line inside this file.

import { type JobsOptions, Queue } from 'bullmq';
import {
  SpanKind,
  SpanStatusCode,
  type Tracer,
} from '@opentelemetry/api';
import { getOctoTracer } from '@octo/observability';
import { createQueue, type QueueConfig } from './create-queue';
import { injectTraceparent, type WithTraceparent } from './traceparent';
import type { QueueName } from './queue-names';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJobData = Record<string, any>;

export class InstrumentedQueue<T extends WithTraceparent = AnyJobData> {
  // Queue<AnyJobData>: BullMQ's ExtractDataType resolves trivially over
  // Record<string, any> — no intersection ever enters BullMQ's type system.
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
          // injectTraceparent returns T (not T & WithTraceparent).
          // Single contained cast to AnyJobData for the internal queue.add().
          const instrumentedData: AnyJobData = injectTraceparent(data);
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
export function createInstrumentedQueue<T extends WithTraceparent = AnyJobData>(
  name: QueueName | string,
  config: QueueConfig,
): InstrumentedQueue<T> {
  return new InstrumentedQueue<T>(name, config);
}
