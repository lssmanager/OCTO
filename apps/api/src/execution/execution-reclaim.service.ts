import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@octo/queue';
import type { ExecutionCommandQueue } from './ports/execution-command-queue';
import type { ExecutionReclaimRepo } from './ports/execution-reclaim.repo';

const REPLAY_DISPATCH_QUEUE = QUEUES.EXECUTION_DISPATCH;
const STALE_STATES = ['running', 'dispatched'] as const;
const TERMINAL_STATES = ['completed', 'failed', 'cancelled'] as const;

export type StaleExecutionRow = {
  id: string;
  tenantId: string;
  state: string;
  version: number;
  reclaimCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

@Injectable()
export class ExecutionReclaimService {
  static readonly MAX_RECLAIM_ATTEMPTS = 3;
  static readonly BATCH_LIMIT = 50;

  private readonly logger = new Logger(ExecutionReclaimService.name);

  constructor(
    private readonly executionRepo: ExecutionReclaimRepo,
    private readonly queue: ExecutionCommandQueue
  ) {}

  async scanStaleLeases(): Promise<void> {
    this.logger.log('reclaim_scan_started', { event: 'reclaim_scan_started' });
    const stale = await this.executionRepo.findStaleLeases(STALE_STATES, ExecutionReclaimService.BATCH_LIMIT);
    for (const execution of stale) {
      await this.reclaimExecution(execution);
    }
    this.logger.log('reclaim_scan_completed', { event: 'reclaim_scan_completed', scanned: stale.length });
  }

  async reclaimExecution(execution: StaleExecutionRow): Promise<'reclaimed' | 'dlq' | 'noop'> {
    if (TERMINAL_STATES.includes(execution.state as (typeof TERMINAL_STATES)[number])) {
      return 'noop';
    }

    if (execution.reclaimCount >= ExecutionReclaimService.MAX_RECLAIM_ATTEMPTS) {
      await this.routeToDLQ(execution);
      return 'dlq';
    }

    const casUpdated = await this.executionRepo.casReclaiming(execution);
    if (!casUpdated) {
      this.logger.warn('reclaim_cas_conflict', {
        event: 'reclaim_cas_conflict',
        execution_id: execution.id,
        tenant_id: execution.tenantId,
        reclaim_count: execution.reclaimCount,
        state: execution.state,
      });
      return 'noop';
    }

    const nextReclaimCount = execution.reclaimCount + 1;
    await this.queue.add(
      REPLAY_DISPATCH_QUEUE,
      {
        executionId: execution.id,
        tenantId: execution.tenantId,
        reason: 'reclaim_replay',
        attempt: nextReclaimCount,
        reclaimCount: nextReclaimCount,
        enqueuedAt: new Date().toISOString(),
      },
      {
        jobId: `reclaim:${execution.id}:${nextReclaimCount}`,
        priority: 1,
      }
    );

    this.logger.log('execution_reclaim_replay_enqueued', {
      event: 'execution_reclaim_replay_enqueued',
      execution_id: execution.id,
      tenant_id: execution.tenantId,
      reclaim_count: nextReclaimCount,
      state: execution.state,
      queue: REPLAY_DISPATCH_QUEUE,
    });

    return 'reclaimed';
  }

  async routeToDLQ(execution: StaleExecutionRow): Promise<'dlq' | 'noop'> {
    if (TERMINAL_STATES.includes(execution.state as (typeof TERMINAL_STATES)[number])) {
      return 'noop';
    }

    const updated = await this.executionRepo.casRouteToDlq(execution);
    if (!updated) {
      this.logger.warn('reclaim_cas_conflict', {
        event: 'reclaim_cas_conflict',
        execution_id: execution.id,
        tenant_id: execution.tenantId,
        reclaim_count: execution.reclaimCount,
        state: execution.state,
      });
      return 'noop';
    }

    this.logger.error('execution_routed_to_dlq', {
      event: 'execution_routed_to_dlq',
      execution_id: execution.id,
      tenant_id: execution.tenantId,
      reclaim_count: execution.reclaimCount,
      reason: 'max_reclaims',
    });

    return 'dlq';
  }
}
