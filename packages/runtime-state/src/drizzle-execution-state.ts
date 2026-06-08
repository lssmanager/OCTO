import { and, eq, sql } from 'drizzle-orm';
import { executionEvents, executions } from '@octo/database';
import type { TenantTransaction } from '@octo/database';

import { ExecutionStateService } from './execution-state.service';

export type DrizzleExecutionStateContext = {
  expectedVersion?: number;
  expectedLeaseOwner?: string | null;
  tenantId: string;
  traceId: string;
  runId: string;
  agentId: string;
  source: string;
  rowPatch?: Record<string, unknown>;
  eventMetadata?: Record<string, unknown>;
};

export function createDrizzleExecutionStateService(context: DrizzleExecutionStateContext) {
  return new ExecutionStateService({
    updateExecutionStatus: async (tx, executionId, from, to) => {
      const rowPatch = context.rowPatch ?? {};
      const updatedAt = rowPatch['updatedAt'] instanceof Date ? rowPatch['updatedAt'] : new Date();
      const updated = await (tx as TenantTransaction)
        .update(executions)
        .set({
          ...rowPatch,
          state: to,
          status: to,
          version: sql`${executions.version} + 1`,
          updatedAt,
        })
        .where(
          and(
            eq(executions.id, executionId),
            eq(executions.tenantId, context.tenantId),
            eq(executions.status, from),
            context.expectedVersion == null
              ? sql`TRUE`
              : eq(executions.version, context.expectedVersion),
            context.expectedLeaseOwner === undefined
              ? sql`TRUE`
              : context.expectedLeaseOwner === null
                ? sql`${executions.leaseOwner} IS NULL`
                : eq(executions.leaseOwner, context.expectedLeaseOwner)
          )
        )
        .returning({ id: executions.id });

      return updated.length > 0;
    },
    appendExecutionEvent: async (tx, executionId, eventType, payload) => {
      await (tx as TenantTransaction).insert(executionEvents).values({
        executionId,
        tenantId: context.tenantId,
        traceId: context.traceId,
        runId: context.runId,
        agentId: context.agentId,
        source: context.source,
        type: eventType,
        payload,
        metadata: context.eventMetadata ?? {},
      });
    },
  });
}
