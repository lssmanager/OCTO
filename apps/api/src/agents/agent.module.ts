import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentPolicyResolverService } from './agent-policy-resolver.service';
import { PostgresAgentRepo } from './postgres-agent.repo';

@Module({
  controllers: [AgentController],
  providers: [
    { provide: 'AgentRepo', useClass: PostgresAgentRepo },
    { provide: AgentPolicyResolverService, useFactory: (repo: any) => new AgentPolicyResolverService(repo), inject: ['AgentRepo'] },
    { provide: AgentService, useFactory: (repo: any, policy: AgentPolicyResolverService) => new AgentService(repo, policy), inject: ['AgentRepo', AgentPolicyResolverService] },
  ],
})
export class AgentModule {}
