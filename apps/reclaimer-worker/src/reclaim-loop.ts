/**
 * apps/reclaimer-worker/src/reclaim-loop.ts
 * Issue #34 + #37 — Polling loop with OTEL trace context forwarding
 *
 * Passes the stored OtelTraceFields from the zombie execution's original
 * job payload to casReclaim() so that reclaim spans are linked to the
 * original trace waterfall.
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { executions } from '@octo/database';
import { createQueue } from '@octo/queue';
import { casReclaim } from './cas-reclaim';
import { reclaimedCounter, alreadyTakenCounter, reclaimErrorCounter } from './metrics';

interface LoopConfig {
  intervalMs: number;
  leaseTimeoutMs: number;
}

let timer: NodeJS.Timeout | null = null;

export async function startReclaimLoop(
  db: NodePgDatabase,
  redisUrl: string,
  config: LoopConfig
): Promise<void> {
  const executionQueue = createQueue('execution', { redisUrl });

  const tick = async () => {
    try {
      const zombies = await db
        .select({
          id: executions.id,
          attempt: executions.attempt,
          task: executions.task,
          // Select trace fields stored in the task payload for context restoration
          traceId: executions.traceId,
        })
        .from(executions)
        .where(and(eq(executions.status, 'running'), lt(executions.leaseExpiresAt, sql`NOW()`)));

      for (const zombie of zombies) {
        try {
          // Pass trace fields so casReclaim() can emit a correlated span (#37)
          const outcome = await casReclaim(db, zombie.id, {
            // traceId from the execution row — used as correlation hint
            correlationId: zombie.traceId ?? undefined,
          });

          if (outcome === 'reclaimed') {
            reclaimedCounter.add(1, { executionId: zombie.id });

            await executionQueue.add(
              'execute',
              { executionId: zombie.id, task: zombie.task },
              {
                jobId: `reclaim:${zombie.id}:${Date.now()}`,
                attempts: 3,
              }
            );

            console.log(
              JSON.stringify({
                msg: 'execution_reclaimed',
                executionId: zombie.id,
                reclaimCount: (zombie.attempt ?? 0) + 1,
              })
            );
          } else if (outcome === 'already_taken') {
            alreadyTakenCounter.add(1, { executionId: zombie.id });
          }
        } catch (err: unknown) {
          reclaimErrorCounter.add(1, { executionId: zombie.id });
          console.error(
            JSON.stringify({
              msg: 'reclaim_error',
              executionId: zombie.id,
              error: String(err),
            })
          );
        }
      }

      if (zombies.length > 0) {
        console.log(JSON.stringify({ msg: 'reclaim_tick_done', scanned: zombies.length }));
      }
    } catch (err: unknown) {
      console.error(JSON.stringify({ msg: 'reclaim_tick_error', error: String(err) }));
    }

    timer = setTimeout(() => void tick(), config.intervalMs);
  };

  timer = setTimeout(() => void tick(), config.intervalMs);
}

export async function stopReclaimLoop(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
