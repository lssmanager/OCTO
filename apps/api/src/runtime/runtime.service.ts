import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class RuntimeService {
  constructor(
    private readonly deps: {
      health: () => Promise<any>;
      queues: () => Promise<any>;
      workers: (tenantId: string) => Promise<any>;
      getExecution: (tenantId: string, executionId: string) => Promise<{ id: string; state: string; stale: boolean } | null>;
      enqueueReclaim: (tenantId: string, executionId: string) => Promise<void>;
      cancelAll: (tenantId: string, states: string[]) => Promise<{ requestedCount: number; skippedTerminalCount: number }>;
    }
  ) {}

  health() { return this.deps.health(); }
  queues() { return this.deps.queues(); }
  workers(tenantId: string) { return this.deps.workers(tenantId); }

  async reclaim(tenantId: string, executionId: string) {
    const row = await this.deps.getExecution(tenantId, executionId);
    if (!row) throw new NotFoundException('EXECUTION_NOT_FOUND');
    if (!row.stale) throw new BadRequestException('EXECUTION_NOT_STUCK');
    await this.deps.enqueueReclaim(tenantId, executionId);
    return { executionId, reclaimQueued: true, state: row.state };
  }

  async cancelAll(tenantId: string, dto: { tenantId: string; reason: string; confirm: string; states?: string[] }, roles: string[]) {
    if (!roles.includes('tenant_admin')) throw new ForbiddenException('CANCEL_ALL_FORBIDDEN');
    if (dto.tenantId !== tenantId || dto.confirm !== 'CANCEL_ALL_ACTIVE_EXECUTIONS') throw new ForbiddenException('CANCEL_ALL_FORBIDDEN');
    const states = dto.states ?? ['queued', 'dispatched', 'running', 'waiting_human', 'retry_scheduled', 'reclaimable'];
    const res = await this.deps.cancelAll(tenantId, states);
    return { tenantId, ...res, reason: dto.reason };
  }
}
