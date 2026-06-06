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
const otherTenantId = `${tenantId}-other`;

async function cleanupTenant(id = tenantId) {
  await withTenantTx(id, async (tx) => {
    await tx.delete(agentVersions).where(eq(agentVersions.tenantId, id));
    await tx.delete(agents).where(eq(agents.tenantId, id));
    await tx.delete(hierarchyNodes).where(eq(hierarchyNodes.tenantId, id));
  });
}

function makeService() {
  const repo = new PostgresAgentRepo();
  return new AgentService(repo as any, new AgentPolicyResolverService(repo as any));
}

async function createChain(service = makeService(), id = tenantId) {
  const agency = await service.createNode(id, {
    level: 'agency',
    name: `F1 Agency ${randomUUID()}`,
    toolPolicy: { allow: ['builtin.echo', 'danger.tool'] },
    capabilities: ['agency.capability'],
  });
  const department = await service.createNode(id, {
    level: 'department',
    name: 'Engineering',
    parentId: agency.id,
    toolPolicy: { deny: ['danger.tool'] },
    capabilities: ['department.capability'],
  });
  const workspace = await service.createNode(id, {
    level: 'workspace',
    name: 'Platform Workspace',
    parentId: department.id,
    budgetPolicy: { maxUsdPerRun: '0.10' },
    capabilities: ['workspace.capability'],
  });
  const agent = await service.create(id, 'user-f1', {
    name: 'Graph Smoke Agent',
    role: 'operator',
    goal: 'prove graph persistence',
    hierarchyLevel: 'agent',
    hierarchyParentId: workspace.id,
    capabilities: ['agent.capability'],
  });
  const agentNode = (await service.graph(id)).flatMap(function walk(node): any[] { return [node, ...node.children.flatMap(walk)]; }).find((node) => node.agent?.id === agent.id)!;
  return { agency, department, workspace, agent, agentNode };
}

describeIfDb('F1 Agent Graph persisted hierarchy', () => {
  afterAll(async () => {
    await cleanupTenant();
    await cleanupTenant(otherTenantId);
  });

  it('creates Agency → Department → Workspace → Agent and returns persisted effective graph after service re-instantiation', async () => {
    await cleanupTenant();
    const service = makeService();
    const { agency, department, workspace, agent } = await createChain(service);

    const freshService = makeService();
    const graph = await freshService.graph(tenantId);
    const graphAgency = graph.find((node) => node.id === agency.id)!;
    const graphDepartment = graphAgency.children.find((node) => node.id === department.id)!;
    const graphWorkspace = graphDepartment.children.find((node) => node.id === workspace.id)!;
    const graphAgent = graphWorkspace.children.find((node) => node.agent?.id === agent.id)!;

    expect(graphAgent.level).toBe('agent');
    expect(graphAgent.parentId).toBe(workspace.id);
    expect(graphAgent.effectiveCapabilities).toEqual(['agency.capability', 'department.capability', 'workspace.capability', 'agent.capability']);
    expect(graphAgent.effectiveCapabilities).not.toContain('builtin.echo');
    expect(graphAgent.effectivePolicies).toMatchObject({
      toolPolicy: { allow: ['builtin.echo'], deny: ['danger.tool'] },
      budgetPolicy: { maxUsdPerRun: '0.10' },
    });
  });

  it('keeps graph and policy resolver semantics aligned for inherited capabilities and tool deny', async () => {
    await cleanupTenant();
    const service = makeService();
    const { agent } = await createChain(service);

    const graphAgent = (await service.graph(tenantId)).flatMap(function walk(node): any[] { return [node, ...node.children.flatMap(walk)]; }).find((node) => node.agent?.id === agent.id)!;
    const snapshot = await service.getEffectivePolicySnapshot(tenantId, agent.id);

    expect(snapshot.effectiveCapabilities).toEqual(graphAgent.effectiveCapabilities);
    expect(snapshot.toolPolicy).toEqual(graphAgent.effectivePolicies.toolPolicy);
    expect(snapshot.effectiveCapabilities).toEqual(['agency.capability', 'department.capability', 'workspace.capability', 'agent.capability']);
    expect(snapshot.toolPolicy).toEqual({ allow: ['builtin.echo'], deny: ['danger.tool'] });
  });

  it('returns local or empty effectiveCapabilities when ancestors do not declare capabilities', async () => {
    await cleanupTenant();
    const service = makeService();
    const agency = await service.createNode(tenantId, { level: 'agency', name: `Empty Agency ${randomUUID()}` });
    const department = await service.createNode(tenantId, { level: 'department', name: 'Empty Department', parentId: agency.id });
    const workspace = await service.createNode(tenantId, { level: 'workspace', name: 'Empty Workspace', parentId: department.id });
    const emptyAgent = await service.create(tenantId, 'user-f1', { name: 'Empty Agent', role: 'operator', goal: 'empty caps', hierarchyLevel: 'agent', hierarchyParentId: workspace.id });
    const localAgent = await service.create(tenantId, 'user-f1', { name: 'Local Agent', role: 'operator', goal: 'local caps', hierarchyLevel: 'agent', hierarchyParentId: workspace.id, capabilities: ['local.capability'] });
    const flat = (await service.graph(tenantId)).flatMap(function walk(node): any[] { return [node, ...node.children.flatMap(walk)]; });

    expect(flat.find((node) => node.agent?.id === emptyAgent.id)!.effectiveCapabilities).toEqual([]);
    expect(flat.find((node) => node.agent?.id === localAgent.id)!.effectiveCapabilities).toEqual(['local.capability']);
  });

  it('updates descendant Agent effectiveCapabilities after patching an ancestor node', async () => {
    await cleanupTenant();
    const service = makeService();
    const { agency, agent } = await createChain(service);

    await service.patchNode(tenantId, agency.id, { capabilities: ['agency.capability', 'agency.patch'] });
    const graphAgent = (await service.graph(tenantId)).flatMap(function walk(node): any[] { return [node, ...node.children.flatMap(walk)]; }).find((node) => node.agent?.id === agent.id)!;

    expect(graphAgent.effectiveCapabilities).toEqual(['agency.capability', 'agency.patch', 'department.capability', 'workspace.capability', 'agent.capability']);
  });

  it('rejects creating Agent hierarchy nodes through the generic nodes endpoint', async () => {
    await cleanupTenant();
    const service = makeService();

    await expect(service.createNode(tenantId, { level: 'agent', name: 'Invalid Node Agent' })).rejects.toMatchObject({ status: 400 });
  });

  it('patches node fields, policies and activationState for F1 node levels', async () => {
    await cleanupTenant();
    const service = makeService();
    const { agency, department, workspace, agentNode } = await createChain(service);

    const patchedAgency = await service.patchNode(tenantId, agency.id, { name: 'Patched Agency', slug: 'patched-agency', activationState: 'inactive', modelPolicy: { primaryModel: 'agency/model' } });
    const patchedDepartment = await service.patchNode(tenantId, department.id, { activationState: 'paused', toolPolicy: { deny: ['danger'] } });
    const patchedWorkspace = await service.patchNode(tenantId, workspace.id, { activationState: 'archived', budgetPolicy: { maxUsdPerRun: '0.20' } });
    const patchedAgentNode = await service.patchNode(tenantId, agentNode.id, { activationState: 'active', memoryPolicy: { retention: 'short' } });

    expect(patchedAgency).toMatchObject({ name: 'Patched Agency', slug: 'patched-agency', activationState: 'inactive' });
    expect(patchedDepartment.activationState).toBe('inactive');
    expect(patchedDepartment.localPolicies.toolPolicy).toEqual({ deny: ['danger'] });
    expect(patchedWorkspace.activationState).toBe('archived');
    expect(patchedAgentNode.localPolicies.memoryPolicy).toEqual({ retention: 'short' });
  });

  it('patches an Agent and synchronizes the linked hierarchy node when operational fields apply', async () => {
    await cleanupTenant();
    const service = makeService();
    const { agent, agentNode } = await createChain(service);

    const patchedAgent = await service.patch(tenantId, agent.id, {
      name: 'Patched Agent',
      role: 'reviewer',
      goal: 'review graph changes',
      status: 'active',
      capabilities: ['graph.patch'],
      activationState: 'inactive',
      modelPolicy: { primaryModel: 'agent/model' },
    }, 'user-f1');
    const patchedNode = await service.nodeDetail(tenantId, agentNode.id);

    expect(patchedAgent).toMatchObject({ name: 'Patched Agent', role: 'reviewer', goal: 'review graph changes', status: 'active' });
    expect(patchedNode).toMatchObject({ name: 'Patched Agent', activationState: 'inactive' });
    expect(patchedNode.localPolicies.modelPolicy).toEqual({ primaryModel: 'agent/model' });
    expect(patchedNode.effectiveCapabilities).toEqual(['agency.capability', 'department.capability', 'workspace.capability', 'graph.patch']);
  });

  it('reparents valid department, workspace and agent nodes and refreshes descendant agent metadata', async () => {
    await cleanupTenant();
    const service = makeService();
    const { department, workspace, agent, agentNode } = await createChain(service);
    const secondAgency = await service.createNode(tenantId, { level: 'agency', name: 'Second Agency' });
    const secondDepartment = await service.createNode(tenantId, { level: 'department', name: 'Second Department', parentId: secondAgency.id });
    const secondWorkspace = await service.createNode(tenantId, { level: 'workspace', name: 'Second Workspace', parentId: secondDepartment.id });

    const movedDepartment = await service.reparentNode(tenantId, department.id, { parentId: secondAgency.id });
    const agentAfterDepartmentMove = await service.get(tenantId, agent.id);
    const movedWorkspace = await service.reparentNode(tenantId, workspace.id, { parentId: secondDepartment.id });
    const agentAfterWorkspaceMove = await service.get(tenantId, agent.id);
    const movedAgentNode = await service.reparentNode(tenantId, agentNode.id, { parentId: secondWorkspace.id });
    const movedAgent = await service.get(tenantId, agent.id);

    expect(movedDepartment.parentId).toBe(secondAgency.id);
    expect(agentAfterDepartmentMove.metadata).toMatchObject({ agencyId: secondAgency.id, workspaceId: workspace.id });
    expect(movedWorkspace.parentId).toBe(secondDepartment.id);
    expect(agentAfterWorkspaceMove.metadata).toMatchObject({ agencyId: secondAgency.id, workspaceId: workspace.id });
    expect(movedAgentNode.parentId).toBe(secondWorkspace.id);
    expect(movedAgent.metadata).toMatchObject({ agencyId: secondAgency.id, workspaceId: secondWorkspace.id });
  });

  it('rejects invalid hierarchy relations, self-parent, descendant cycles, missing parents and invalid activationState', async () => {
    await cleanupTenant();
    const service = makeService();
    const { agency, department, workspace, agentNode } = await createChain(service);

    await expect(service.reparentNode(tenantId, agentNode.id, { parentId: department.id })).rejects.toMatchObject({ status: 400 });
    await expect(service.reparentNode(tenantId, department.id, { parentId: workspace.id })).rejects.toMatchObject({ status: 400 });
    await expect(service.reparentNode(tenantId, agency.id, { parentId: department.id })).rejects.toMatchObject({ status: 400 });
    await expect(service.reparentNode(tenantId, department.id, { parentId: department.id })).rejects.toMatchObject({ status: 400 });
    await expect(service.reparentNode(tenantId, department.id, { parentId: agentNode.id })).rejects.toMatchObject({ status: 400 });
    await expect(service.reparentNode(tenantId, department.id, { parentId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await expect(service.patchNode(tenantId, workspace.id, { activationState: 'suspended' as any })).rejects.toMatchObject({ status: 400 });
    await expect(service.patchNode(tenantId, workspace.id, { activationState: 'deleted' as any })).rejects.toMatchObject({ status: 400 });
  });

  it('returns cross-tenant hierarchy nodes as not found', async () => {
    await cleanupTenant();
    await cleanupTenant(otherTenantId);
    const service = makeService();
    const { agency } = await createChain(service, tenantId);
    await createChain(service, otherTenantId);

    await expect(service.nodeDetail(otherTenantId, agency.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.patchNode(otherTenantId, agency.id, { name: 'Cross Tenant' })).rejects.toMatchObject({ status: 404 });
    await expect(service.reparentNode(otherTenantId, agency.id, { parentId: null })).rejects.toMatchObject({ status: 404 });
  });

  it('uses archive for non-agent destructive action and physically deletes only the selected Agent node', async () => {
    await cleanupTenant();
    const service = makeService();
    const { workspace, agent, agentNode } = await createChain(service);

    const archivedWorkspace = await service.patchNode(tenantId, workspace.id, { activationState: 'archived' });
    expect(archivedWorkspace.children.some((child) => child.id === agentNode.id)).toBe(true);

    await expect(service.delete(tenantId, agent.id, 'user-f1')).resolves.toEqual({ deleted: true });
    await expect(service.get(tenantId, agent.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.nodeDetail(tenantId, agentNode.id)).rejects.toMatchObject({ status: 404 });
    const workspaceAfterDelete = await service.nodeDetail(tenantId, workspace.id);
    expect(workspaceAfterDelete.id).toBe(workspace.id);
  });
});
