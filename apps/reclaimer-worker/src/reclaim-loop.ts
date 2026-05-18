/**
 * apps/reclaimer-worker/src/reclaim-loop.ts
 * Issue #34 — Zombie execution recovery
 *
 * Polls Postgres every RECLAIM_INTERVAL_MS for executions with
 * expired leases (status = 'running' AND lease_expires_at < NOW())
 * and reclaims them via CAS, then re-enqueues in BullMQ.
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { executions } from '@octo/database';
import { createQueue } from '@octo/queue';
import { casReclaim } from './cas-reclaim';
import { reclaimedCounter, alreadyTakenCounter, reclaimErrorCounter } from './metrics';

interface LoopConfig {
  intervalMs:     number;
  leaseTimeoutMs: number;
}

let timer: NodeJS.Timeout | null = null;

export async function startReclaimLoop(
  db:       NodePgDatabase,
  redisUrl: string,
  config:   LoopConfig,
): Promise<void> {
  const executionQueue = createQueue('execution', { redisUrl });

  const tick = async () => {
    try {
      // Query zombie executions: running but lease expired
      const zombies = await db
        .select({ id: executions.id, attempt: executions.attempt, task: executions.task })
        .from(executions)
        .where(
          and(
            eq(executions.status, 'running'),
            lt(executions.leaseExpiresAt, sql`NOW()`),
          ),
        );

      for (const zombie of zombies) {
        try {
          const outcome = await casReclaim(db, zombie.id);

          if (outcome === 'reclaimed') {
            reclaimedCounter.add(1, { executionId: zombie.id });

            // Re-enqueue the execution for retry
            await executionQueue.add(
              'execute',
              { executionId: zombie.id, task: zombie.task },
              {
                jobId:    `reclaim:${zombie.id}:${Date.now()}`,
                attempts: 3,
              },
            );

            console.log(JSON.stringify({
              msg:          'execution_reclaimed',
              executionId:  zombie.id,
              reclaimCount: (zombie.attempt ?? 0) + 1,
            }));

          } else if (outcome === 'already_taken') {
            alreadyTakenCounter.add(1, { executionId: zombie.id });
            // Another reclaimer won the CAS race — skip silently
          }
          // 'not_found' — execution deleted between query and CAS — skip

        } catch (err: unknown) {
          reclaimErrorCounter.add(1, { executionId: zombie.id });
          console.error(JSON.stringify({
            msg:         'reclaim_error',
            executionId: zombie.id,
            error:       String(err),
          }));
        }
      }

      if (zombies.length > 0) {
        console.log(JSON.stringify({
          msg:       'reclaim_tick_done',
          scanned:   zombies.length,
        }));
      }

    } catch (err: unknown) {
      console.error(JSON.stringify({ msg: 'reclaim_tick_error', error: String(err) }));
    }

    // Schedule next tick
    timer = setTimeout(() => void tick(), config.intervalMs);
  };

  // First tick
  timer = setTimeout(() => void tick(), config.intervalMs);
}

export async function stopReclaimLoop(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
