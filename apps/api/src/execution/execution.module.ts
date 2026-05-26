import { Module } from '@nestjs/common';
import { ExecutionController } from './execution.controller';
import { ExecutionControllerService } from './execution-controller.service';
import { PostgresExecutionRepo } from './postgres-execution.repo';

@Module({
  controllers: [ExecutionController],
  providers: [
    { provide: 'ExecutionControllerRepo', useClass: PostgresExecutionRepo },
    {
      provide: ExecutionControllerService,
      useFactory: (repo: any) => new ExecutionControllerService(repo),
      inject: ['ExecutionControllerRepo'],
    },
  ],
})
export class ExecutionModule {}
