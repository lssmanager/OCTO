import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/hierarchy-access.service';

@Injectable()
export class OpsV1Service {
  constructor(
    private readonly deps: {
      listDlq: (tenantId: string, q: any) => Promise<any>;
      requeue: (tenantId: string, actorId: string, jobId: string, b: any) => Promise<any>;
      discard: (tenantId: string, actorId: string, jobId: string, b: any) => Promise<any>;
      metrics: (tenantId: string) => Promise<any>;
      stale: (tenantId: string) => Promise<any>;
      reset: (tenantId: string, actorId: string, executionId: string, b: any) => Promise<any>;
      f1Status: (tenantId: string, windowMinutes: number) => Promise<any>;
      observeExecution: (principal: AuthPrincipal, executionId: string) => Promise<any>;
      observeTrace: (principal: AuthPrincipal, traceId: string) => Promise<any>;
    }
  ) {}
  listDlq(tenantId: string, q: any) {
    return this.deps.listDlq(tenantId, q);
  }
  async requeue(tenantId: string, actorId: string, jobId: string, b: any) {
    if (!b?.reason) throw new BadRequestException('VALIDATION_ERROR');
    return this.deps.requeue(tenantId, actorId, jobId, b);
  }
  async discard(tenantId: string, actorId: string, jobId: string, b: any) {
    if (!b?.reason) throw new BadRequestException('VALIDATION_ERROR');
    await this.deps.discard(tenantId, actorId, jobId, b);
    return;
  }
  metrics(tenantId: string) {
    return this.deps.metrics(tenantId);
  }
  stale(tenantId: string) {
    return this.deps.stale(tenantId);
  }
  observeExecution(principal: AuthPrincipal, executionId: string) {
    return this.deps.observeExecution(principal, executionId);
  }
  observeTrace(principal: AuthPrincipal, traceId: string) {
    return this.deps.observeTrace(principal, traceId);
  }
  f1Status(tenantId: string, windowMinutes?: number) {
    const window = Number(windowMinutes ?? 15);
    return this.deps.f1Status(tenantId, Number.isFinite(window) && window > 0 ? window : 15);
  }
  async reset(tenantId: string, actorId: string, executionId: string, b: any) {
    if (b?.confirm !== 'RESET_EXECUTION_FOR_REQUEUE')
      throw new BadRequestException('VALIDATION_ERROR');
    const row = await this.deps.reset(tenantId, actorId, executionId, b);
    if (!row) throw new NotFoundException('EXECUTION_NOT_FOUND');
    return row;
  }
}
