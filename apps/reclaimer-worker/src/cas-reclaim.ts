/**
 * apps/reclaimer-worker/src/cas-reclaim.ts
 * Zombie reclaim CAS transition.
 *
 * Canonical F1 reclaim handoff state:
 *   running -> reclaimable
 *
 * The scheduler dispatch worker is responsible for:
 *   reclaimable -> dispatched
 * and the runtime receives that handoff in mode="reclaim".
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { executions, getDb, withTenantTx } from '@octo/database';
import { extractOtelContext } from '@octo/queue';
import type { OtelTraceFields } from '@octo/queue';

export type ReclaimOutcome = 'reclaimed' | 'already_taken' | 'not_found';

export async function casReclaim(
  db: ReturnType<typeof getDb>,
  executionId: string,
  tenantId: string,
  traceFields?: OtelTraceFields
): Promise<ReclaimOutcome> {
  const parentCtx = traceFields ? extractOtelContext(traceFields) : context.active();
  const tracer = trace.getTracer('octo.reclaimer', '0.1.0');

  return tracer.startActiveSpan(
    'execution.reclaim',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'execution.id': executionId,
        'execution.tenant_id': tenantId,
        'messaging.system': 'bullmq',
        'octo.correlation.id': traceFields?.correlationId ?? 'none',
      },
    },
    parentCtx,
    async (span) => {
      try {
        const outcome = await withTenantTx(tenantId, async (tx) => {
          const exists = await tx
            .select({ id: executions.id })
            .from(executions)
            .where(and(eq(executions.id, executionId), eq(executions.tenantId, tenantId)))
            .limit(1);

          if (exists.length === 0) return 'not_found' as const;

          const result = await tx
            .update(executions)
            .set({
              status: 'reclaimable',
              state: 'reclaimable',
              leaseOwner: null,
              workerId: null,
              leaseExpiresAt: null,
              reclaimedAt: sql`NOW()`,
              reclaimCount: sql`${executions.reclaimCount} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(executions.id, executionId),
                eq(executions.tenantId, tenantId),
                eq(executions.status, 'running'),
                lt(executions.leaseExpiresAt, sql`NOW()`)
              )
            )
            .returning({ id: executions.id });

          return result.length > 0 ? ('reclaimed' as const) : ('already_taken' as const);
        });

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
