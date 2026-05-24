import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  controllers: [AgentController],
  providers: [
    { provide: 'AgentRepo', useValue: {
      createAgentWithVersionTx: async () => { throw new Error('AgentRepo.createAgentWithVersionTx not configured'); },
      listAgents: async () => [],
      getAgentById: async () => null,
      patchAgentTx: async () => null,
      deleteAgentTx: async () => false,
      listAgentVersions: async () => [],
      getLatestAgentVersion: async () => null,
      resolveEffectivePolicySnapshot: async () => null,
    } },
    { provide: AgentService, useFactory: (repo: any) => new AgentService(repo), inject: ['AgentRepo'] },
  ],
})
export class AgentModule {}
