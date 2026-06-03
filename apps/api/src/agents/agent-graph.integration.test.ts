import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { agentVersions, agents, hierarchyNodes, withTenantTx } from '@octo/database';
import { AgentPolicyResolverService } from './agent-policy-resolver.service';
import { AgentService } from './agent.service';
import { PostgresAgentRepo } from './postgres-agent.repo';

const databaseUrl = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const describeIfDb = databaseUrl ? describe : describe.skip;
const tenantId = `tenant-f1-graph-${randomUUID()}`;

async function cleanupTenant() {
  await withTenantTx(tenantId, async (tx) => {
    await tx.delete(agentVersions).where(eq(agentVersions.tenantId, tenantId));
    await tx.delete(agents).where(eq(agents.tenantId, tenantId));
    await tx.delete(hierarchyNodes).where(eq(hierarchyNodes.tenantId, tenantId));
  });
}

describeIfDb('F1 Agent Graph persisted hierarchy', () => {
  afterAll(async () => {
    await cleanupTenant();
  });

  it('creates an agent, persists its workspace relationship, and returns the graph after service re-instantiation', async () => {
    await cleanupTenant();
    const repo = new PostgresAgentRepo();
    const service = new AgentService(repo as any, new AgentPolicyResolverService(repo as any));

    const agency = await service.createNode(tenantId, {
      level: 'agency',
      name: 'F1 Test Agency',
      toolPolicy: { allow: ['builtin.echo'] },
    });
    const department = await service.createNode(tenantId, { level: 'department', name: 'Engineering', parentId: agency.id });
    const workspace = await service.createNode(tenantId, {
      level: 'workspace',
      name: 'Platform Workspace',
      parentId: department.id,
      budgetPolicy: { maxUsdPerRun: '0.10' },
    });
    const agent = await service.create(tenantId, 'user-f1', {
      name: 'Graph Smoke Agent',
      role: 'operator',
      goal: 'prove graph persistence',
      hierarchyLevel: 'agent',
      hierarchyParentId: workspace.id,
      capabilities: ['graph.create'],
    });

    const freshService = new AgentService(new PostgresAgentRepo() as any, new AgentPolicyResolverService(new PostgresAgentRepo() as any));
    const graph = await freshService.graph(tenantId);
    const graphAgency = graph.find((node) => node.id === agency.id)!;
    const graphDepartment = graphAgency.children.find((node) => node.id === department.id)!;
    const graphWorkspace = graphDepartment.children.find((node) => node.id === workspace.id)!;
    const graphAgent = graphWorkspace.children.find((node) => node.agent?.id === agent.id)!;

    expect(graphAgent.level).toBe('agent');
    expect(graphAgent.parentId).toBe(workspace.id);
    expect(graphAgent.effectiveCapabilities).toEqual(['graph.create']);
    expect(graphAgent.effectivePolicies).toMatchObject({
      toolPolicy: { allow: ['builtin.echo'] },
      budgetPolicy: { maxUsdPerRun: '0.10' },
    });
  });
});
