import { Module } from '@nestjs/common';
import { ExecutionController } from './execution.controller';
import { ExecutionControllerService } from './execution-controller.service';

@Module({
  controllers: [ExecutionController],
  providers: [
    {
      provide: 'ExecutionControllerRepo',
      useValue: {
        createExecution: async () => {
          throw new Error('ExecutionControllerRepo.createExecution not configured');
        },
        getExecutionSummary: async () => null,
        getExecutionTimeline: async () => [],
        casRequestCancellation: async () => false,
        casResumeSuspended: async () => false,
        createOutboxEntry: async () => undefined,
      },
    },
    {
      provide: ExecutionControllerService,
      useFactory: (repo: any) => new ExecutionControllerService(repo),
      inject: ['ExecutionControllerRepo'],
    },
  ],
})
export class ExecutionModule {}
