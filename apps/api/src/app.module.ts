import { Module } from '@nestjs/common';
import { loadApiConfig } from '@octo/config';
import { HealthModule } from './health/health.module';

// Called once at module load — exits process immediately if env is invalid.
const config = loadApiConfig();

@Module({
  imports: [
    HealthModule,
    // F1: RunsModule, ExecutionsModule
    // F2: HierarchyModule, AgentsModule
    // F3: AgentIntelligenceModule
  ],
  providers: [
    {
      // Typed config token — inject with @Inject('CONFIG')
      provide: 'CONFIG',
      useValue: config,
    },
  ],
  exports: ['CONFIG'],
})
export class AppModule {}
