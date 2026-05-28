/**
 * apps/reclaimer-worker/src/cas-reclaim.ts
 * Issue #34 + #37 — CAS reclaim with correlated OTEL span
 *
 * Emits an 'execution.reclaim.cas' OTEL span linked to the original
 * execution trace via the traceparent stored in the job payload.
 * This makes reclaim spans appear as children in the full trace waterfall.
 *
 * Span attributes:
 *   execution.id           — the reclaimed execution ID
 *   reclaim.outcome        — 'reclaimed' | 'already_taken' | 'not_found'
 *   octo.correlation.id    — from job payload (if present)
 *   messaging.system       — 'bullmq'
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { executions, getDb } from '@octo/database';
import { extractOtelContext } from '@octo/queue';
import type { OtelTraceFields } from '@octo/queue';

export type ReclaimOutcome = 'reclaimed' | 'already_taken' | 'not_found';

export async function casReclaim(
  db: ReturnType<typeof getDb>,
  executionId: string,
  traceFields?: OtelTraceFields
): Promise<ReclaimOutcome> {
  // Restore trace context from original job payload (if available)
  const parentCtx = traceFields ? extractOtelContext(traceFields) : context.active();
  const tracer = trace.getTracer('octo.reclaimer', '0.1.0');

  return tracer.startActiveSpan(
    'execution.reclaim.cas',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'execution.id': executionId,
        'messaging.system': 'bullmq',
        'octo.correlation.id': traceFields?.correlationId ?? 'none',
      },
    },
    parentCtx,
    async (span) => {
      try {
        // Check existence first
        const exists = await db
          .select({ id: executions.id })
          .from(executions)
          .where(eq(executions.id, executionId))
          .limit(1);

        if (exists.length === 0) {
          span.setAttribute('reclaim.outcome', 'not_found');
          span.setStatus({ code: SpanStatusCode.OK });
          return 'not_found';
        }

        // CAS UPDATE: only wins if status='running' AND lease expired
        const result = await db
          .update(executions)
          .set({
            status: 'retrying',
            leaseExpiresAt: null,
            reclaimedAt: sql`NOW()`,
            reclaimCount: sql`reclaim_count + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(executions.id, executionId),
              eq(executions.status, 'running'),
              lt(executions.leaseExpiresAt, sql`NOW()`)
            )
          )
          .returning({ id: executions.id });

        const outcome: ReclaimOutcome = result.length > 0 ? 'reclaimed' : 'already_taken';
        span.setAttribute('reclaim.outcome', outcome);
        span.setStatus({ code: SpanStatusCode.OK });
        return outcome;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    }
  );
}
