import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentPolicyResolverService } from './agent-policy-resolver.service';

@Module({
  controllers: [AgentController],
  providers: [
    {
      provide: 'AgentRepo',
      useValue: {
        createAgentWithVersionTx: async () => { throw new Error('AgentRepo.createAgentWithVersionTx not configured'); },
        listAgents: async () => [],
        getAgentById: async () => null,
        patchAgentTx: async () => null,
        deleteAgentTx: async () => false,
        listAgentVersions: async () => [],
        getLatestAgentVersion: async () => null,
        resolveEffectivePolicySnapshot: async () => null,
        getAgentLocalConfig: async () => null,
        getWorkspacePolicyDefaults: async () => null,
        getAgentVersion: async () => 1,
      },
    },
    { provide: AgentPolicyResolverService, useFactory: (repo: any) => new AgentPolicyResolverService(repo), inject: ['AgentRepo'] },
    { provide: AgentService, useFactory: (repo: any, policy: AgentPolicyResolverService) => new AgentService(repo, policy), inject: ['AgentRepo', AgentPolicyResolverService] },
  ],
})
export class AgentModule {}
