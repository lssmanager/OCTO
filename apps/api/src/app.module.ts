import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    // F1: RunsModule, ExecutionsModule
    // F2: HierarchyModule, AgentsModule
    // F3: AgentIntelligenceModule
    // etc.
  ],
})
export class AppModule {}
