import { Module } from '@nestjs/common';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';

@Module({
  controllers: [RuntimeController],
  providers: [{
    provide: RuntimeService,
    useFactory: () => new RuntimeService({
      health: async () => ({ status: 'healthy', checkedAt: new Date().toISOString(), components: { api: { status: 'healthy' }, schedulerWorker: { status: 'healthy' }, runtimeWorker: { status: 'healthy' }, litellmGateway: { status: 'healthy' }, redis: { status: 'healthy' }, postgres: { status: 'healthy' } } }),
      queues: async () => ({ queues: [], checkedAt: new Date().toISOString() }),
      workers: async () => ({ workers: [], checkedAt: new Date().toISOString() }),
      getExecution: async () => null,
      enqueueReclaim: async () => undefined,
      cancelAll: async () => ({ requestedCount: 0, skippedTerminalCount: 0 }),
    }),
  }],
})
export class RuntimeModule {}
