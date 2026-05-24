// apps/api/src/ops/ops.module.ts
// H1: Ops Console — infrastructure status endpoint.
// F0-only: exposes build metadata + service health + queue stats.
// No F1+ features (agents, memory, channels, etc.).

import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { OpsV1Controller, OpsExecutionController } from './ops-v1.controller';
import { OpsV1Service } from './ops-v1.service';

@Module({
  imports: [HealthModule],
  controllers: [OpsController, OpsV1Controller, OpsExecutionController],
  providers: [OpsService, { provide: OpsV1Service, useFactory: () => new OpsV1Service({ listDlq: async () => ({ jobs: [], total: 0, page: 1, pageSize: 20 }), requeue: async (_t,_a,jobId,_b) => ({ jobId, executionId: 'unknown', requeued: true, targetQueue: 'ops.dlq.reprocess' }), discard: async () => undefined, metrics: async () => ({ windowSeconds: 300, reclaimRate: 0, successRate: 0, dlqRate: 0, p50LatencyMs: null, p95LatencyMs: null, activeExecutions: 0, queuedExecutions: 0, failedExecutions: 0, checkedAt: new Date().toISOString() }), stale: async () => ({ executions: [], checkedAt: new Date().toISOString() }), reset: async (_t,_a,executionId,_b) => ({ executionId, state: 'QUEUED', reset: true }) }) }],
})
export class OpsModule {}
