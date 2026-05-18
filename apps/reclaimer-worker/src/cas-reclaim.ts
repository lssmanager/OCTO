/**
 * apps/reclaimer-worker/src/cas-reclaim.ts
 * Issue #34 — Zombie execution recovery
 *
 * CAS-safe reclaim of a single zombie execution.
 *
 * PATTERN:
 *   UPDATE executions
 *   SET    status = 'retrying',
 *          lease_expires_at = NULL,
 *          reclaimed_at = NOW(),
 *          reclaim_count = reclaim_count + 1
 *   WHERE  id = $executionId
 *     AND  status = 'running'
 *     AND  lease_expires_at < NOW()
 *   RETURNING id
 *
 *   0 rows → 'already_taken' (another reclaimer won) or 'not_found'
 *   1 row  → 'reclaimed' (this instance wins, proceeds to re-enqueue)
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { executions } from '@octo/database';

export type ReclaimOutcome = 'reclaimed' | 'already_taken' | 'not_found';

export async function casReclaim(
  db:          NodePgDatabase,
  executionId: string,
): Promise<ReclaimOutcome> {
  // First check if the execution exists at all
  const exists = await db
    .select({ id: executions.id })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);

  if (exists.length === 0) return 'not_found';

  // CAS UPDATE: only wins if status is still 'running' AND lease is still expired
  const result = await db
    .update(executions)
    .set({
      status:         'retrying',
      leaseExpiresAt: null,
      reclaimedAt:    sql`NOW()`,
      reclaimCount:   sql`reclaim_count + 1`,
      updatedAt:      new Date(),
    })
    .where(
      and(
        eq(executions.id, executionId),
        eq(executions.status, 'running'),
        lt(executions.leaseExpiresAt, sql`NOW()`),
      ),
    )
    .returning({ id: executions.id });

  return result.length > 0 ? 'reclaimed' : 'already_taken';
}
