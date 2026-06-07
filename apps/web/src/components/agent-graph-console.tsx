'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AgentGraphNode } from '@/lib/agent-graph';

type Props = { initialNodes: AgentGraphNode[]; writesConfigured: boolean; initialError?: string | undefined };
type Level = AgentGraphNode['level'];
type ConsoleAction = 'createNode' | 'createAgent' | 'patchNode' | 'reparentNode' | 'patchAgent' | 'deleteAgent' | 'archiveNode' | 'setActivationState';

const nextLevel: Record<Level, Level | null> = { agency: 'department', department: 'workspace', workspace: 'agent', agent: null };
const parentLevel: Record<Level, Level | null> = { agency: null, department: 'agency', workspace: 'department', agent: 'workspace' };
const labels: Record<Level, string> = { agency: 'Agency', department: 'Department', workspace: 'Workspace', agent: 'Agent' };
const activationStates = ['active', 'inactive', 'archived'];
const emptyPolicy = '{\n}';

function flatten(nodes: AgentGraphNode[]): AgentGraphNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function firstNode(nodes: AgentGraphNode[]): AgentGraphNode | null {
  return nodes[0] ?? null;
}

function hasData(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return Boolean(value);
}

function jsonText(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonField(label: string, value: string) {
  try {
    return JSON.parse(value || '{}') as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function JsonBlock({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  if (!hasData(value)) return <p className="text-xs italic" style={{ color: 'var(--color-text-faint)' }}>{emptyLabel}</p>;
  return <pre className="text-xs whitespace-pre-wrap rounded-md border p-3 overflow-auto max-h-52" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>{JSON.stringify(value, null, 2)}</pre>;
}

function TreeNode({ node, selectedId, onSelect, depth = 0 }: { node: AgentGraphNode; selectedId?: string | undefined; onSelect: (node: AgentGraphNode) => void; depth?: number }) {
  const selected = selectedId === node.id;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onSelect(node)}
        className="w-full text-left rounded-lg border px-3 py-2 transition"
        style={{ marginLeft: depth * 14, borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: selected ? 'rgba(79,152,163,0.14)' : 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono uppercase" style={{ color: 'var(--color-primary)' }}>{labels[node.level]}</span>
          <span className="text-[10px] uppercase" style={{ color: node.activationState === 'archived' ? 'var(--color-error)' : 'var(--color-text-faint)' }}>{node.activationState}</span>
        </div>
        <div className="mt-1 font-medium" style={{ color: 'var(--color-text)' }}>{node.name}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-faint)' }}>{node.children.length} children · runtime {node.runtimeStatus ?? 'not available'}</div>
      </button>
      {node.children.map((child) => <TreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

export function AgentGraphConsole({ initialNodes, writesConfigured, initialError }: Props) {
  const [nodes, setNodes] = useState(initialNodes);
  const [selected, setSelected] = useState<AgentGraphNode | null>(firstNode(initialNodes));
  const [error, setError] = useState(initialError ?? '');
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('executor');
  const [agentGoal, setAgentGoal] = useState('Operate inside this workspace.');
  const [nodeName, setNodeName] = useState('');
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editActivationState, setEditActivationState] = useState('active');
  const [modelPolicy, setModelPolicy] = useState(emptyPolicy);
  const [toolPolicy, setToolPolicy] = useState(emptyPolicy);
  const [budgetPolicy, setBudgetPolicy] = useState(emptyPolicy);
  const [governance, setGovernance] = useState(emptyPolicy);
  const [coreFiles, setCoreFiles] = useState('[]');
  const [memoryPolicy, setMemoryPolicy] = useState(emptyPolicy);
  const [reparentId, setReparentId] = useState('');
  const [editAgentName, setEditAgentName] = useState('');
  const [editAgentRole, setEditAgentRole] = useState('');
  const [editAgentGoal, setEditAgentGoal] = useState('');
  const [editAgentStatus, setEditAgentStatus] = useState('draft');
  const [editCapabilities, setEditCapabilities] = useState('[]');

  const allNodes = useMemo(() => flatten(nodes), [nodes]);
  const workspaceNodes = allNodes.filter((node) => node.level === 'workspace');
  const selectedParent = selected && nextLevel[selected.level] ? selected : workspaceNodes[0] ?? null;
  const validParents = selected ? allNodes.filter((node) => node.level === parentLevel[selected.level] && node.id !== selected.id) : [];

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditSlug(selected.slug);
    setEditActivationState(selected.activationState);
    setModelPolicy(jsonText(selected.localPolicies['modelPolicy']));
    setToolPolicy(jsonText(selected.localPolicies['toolPolicy']));
    setBudgetPolicy(jsonText(selected.localPolicies['budgetPolicy']));
    setGovernance(jsonText(selected.localPolicies['governance']));
    setCoreFiles(JSON.stringify(selected.localPolicies['coreFiles'] ?? [], null, 2));
    setMemoryPolicy(jsonText(selected.localPolicies['memoryPolicy']));
    setReparentId(selected.parentId ?? '');
    setEditAgentName(selected.agent?.name ?? selected.name);
    setEditAgentRole(selected.agent?.role ?? '');
    setEditAgentGoal(selected.agent?.goal ?? '');
    setEditAgentStatus(selected.agent?.status ?? 'draft');
    setEditCapabilities(JSON.stringify(selected.agent?.capabilities ?? [], null, 2));
  }, [selected]);

  async function refresh(selectId?: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/agent-graph');
      if (!res.ok) throw new Error(`Graph refresh failed with HTTP ${res.status}`);
      const fresh = (await res.json()) as AgentGraphNode[];
      setNodes(fresh);
      const flat = flatten(fresh);
      setSelected(flat.find((node) => node.id === (selectId ?? selected?.id)) ?? firstNode(fresh));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh graph');
    } finally {
      setLoading(false);
    }
  }

  async function submit(action: ConsoleAction, body: Record<string, unknown> = {}, ids: { nodeId?: string; agentId?: string } = {}) {
    if (!writesConfigured) {
      setError('Authenticated F1 Agent Graph console writes require a valid console session.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/agent-graph', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, body, ...ids }) });
      if (!res.ok) {
        const failure = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(failure.error ?? failure.message ?? `Write failed with HTTP ${res.status}`);
      }
      const changed = (await res.json()) as { id?: string; hierarchyNodeId?: string };
      await refresh(changed.hierarchyNodeId ?? changed.id ?? ids.nodeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Write failed');
      setLoading(false);
    }
  }

  function patchSelectedNode(activationOverride?: string) {
    if (!selected) return;
    let body: Record<string, unknown>;
    try {
      body = {
        name: editName,
        slug: editSlug,
        activationState: activationOverride ?? editActivationState,
        modelPolicy: parseJsonField('Model policy', modelPolicy),
        toolPolicy: parseJsonField('Tool policy', toolPolicy),
        budgetPolicy: parseJsonField('Budget policy', budgetPolicy),
        governance: parseJsonField('Governance', governance),
        coreFiles: parseJsonField('Core files', coreFiles),
        memoryPolicy: parseJsonField('Memory policy', memoryPolicy),
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Node policy fields must be valid JSON.');
      return;
    }
    void submit(activationOverride === 'archived' ? 'archiveNode' : 'patchNode', body, { nodeId: selected.id });
  }

  function patchSelectedAgent() {
    if (!selected?.agent) return;
    let capabilities: unknown;
    try {
      capabilities = parseJsonField('Capabilities', editCapabilities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capabilities must be valid JSON.');
      return;
    }
    void submit('patchAgent', { name: editAgentName, role: editAgentRole, goal: editAgentGoal, status: editAgentStatus, capabilities }, { agentId: selected.agent.id });
  }

  const childLevel = selectedParent ? nextLevel[selectedParent.level] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase" style={{ color: 'var(--color-primary)' }}>F1 · Agent Graph System</p>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Agent Graph Console</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Operational F1 graph projection: Agency → Department → Workspace → Agent. The backend owns hierarchy, activation and archive invariants.</p>
        </div>
        <button type="button" onClick={() => refresh()} disabled={loading} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>{loading ? 'Working…' : 'Refresh'}</button>
      </div>

      {(error || initialError) && <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(248,81,73,0.08)', color: 'var(--color-error)' }}>{error || initialError}</div>}

      {nodes.length === 0 ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h2 className="font-semibold">No hierarchy persisted yet</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Create an Agency below, then Department, Workspace and Agent. Runtime execution and streaming projections are deferred to F2/F3+.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Hierarchy graph</h2>
            <span className="text-xs" style={{ color: 'var(--color-text-faint)' }}>{allNodes.length} nodes</span>
          </div>
          <div className="space-y-2 overflow-x-auto pb-2">{nodes.map((node) => <TreeNode key={node.id} node={node} selectedId={selected?.id} onSelect={setSelected} />)}</div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="font-semibold">Selected node</h2>
            {selected ? <div className="mt-3 space-y-3">
              <div><span className="text-xs font-mono uppercase" style={{ color: 'var(--color-primary)' }}>{labels[selected.level]}</span><h3 className="font-semibold">{selected.name}</h3><p className="text-xs" style={{ color: 'var(--color-text-faint)' }}>{selected.id}</p></div>
              <p className="text-sm">Activation: <strong>{selected.activationState}</strong> · Runtime: <strong>{selected.runtimeStatus ?? 'not available'}</strong></p>
              {selected.agent && <p className="text-sm">Agent status: <strong>{selected.agent.status}</strong> · role {selected.agent.role}</p>}
              <div><h4 className="mb-1 text-xs font-semibold uppercase">Effective capabilities</h4><JsonBlock value={selected.effectiveCapabilities} emptyLabel="No effective capabilities configured." /></div>
              <div><h4 className="mb-1 text-xs font-semibold uppercase">Effective policies</h4><JsonBlock value={selected.effectivePolicies} emptyLabel="No effective policies configured." /></div>
            </div> : <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Select a graph node to inspect it.</p>}
          </section>

          {selected && <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="font-semibold">Edit node</h2>
            <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Node name" className="mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <input value={editSlug} onChange={(event) => setEditSlug(event.target.value)} placeholder="Slug" className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <select value={editActivationState} onChange={(event) => setEditActivationState(event.target.value)} className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>{activationStates.map((state) => <option key={state} value={state}>{state}</option>)}</select>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <textarea value={modelPolicy} onChange={(event) => setModelPolicy(event.target.value)} className="rounded-md border bg-transparent px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)' }} rows={3} aria-label="Model policy JSON" />
              <textarea value={toolPolicy} onChange={(event) => setToolPolicy(event.target.value)} className="rounded-md border bg-transparent px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)' }} rows={3} aria-label="Tool policy JSON" />
              <textarea value={budgetPolicy} onChange={(event) => setBudgetPolicy(event.target.value)} className="rounded-md border bg-transparent px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)' }} rows={3} aria-label="Budget policy JSON" />
              <textarea value={governance} onChange={(event) => setGovernance(event.target.value)} className="rounded-md border bg-transparent px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)' }} rows={3} aria-label="Governance JSON" />
              <textarea value={coreFiles} onChange={(event) => setCoreFiles(event.target.value)} className="rounded-md border bg-transparent px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)' }} rows={3} aria-label="Core files JSON" />
              <textarea value={memoryPolicy} onChange={(event) => setMemoryPolicy(event.target.value)} className="rounded-md border bg-transparent px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)' }} rows={3} aria-label="Memory policy JSON" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => patchSelectedNode()} className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>Save node</button>
              <button type="button" onClick={() => patchSelectedNode('active')} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>Activate</button>
              <button type="button" onClick={() => patchSelectedNode('inactive')} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>Deactivate</button>
              <button type="button" onClick={() => window.confirm('Archive this node? Descendants are not deleted; the backend records activationState=archived.') && patchSelectedNode('archived')} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>Archive</button>
            </div>
            <h3 className="mt-4 text-sm font-semibold">Reparent</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Choose a parent candidate; backend validates level, tenant, self-parent and cycles.</p>
            <select value={reparentId} onChange={(event) => setReparentId(event.target.value)} className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
              <option value="">No parent/root</option>
              {validParents.map((node) => <option key={node.id} value={node.id}>{labels[node.level]} · {node.name}</option>)}
            </select>
            <button type="button" onClick={() => submit('reparentNode', { parentId: reparentId || null }, { nodeId: selected.id })} className="mt-2 rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>Reparent node</button>
          </section>}

          {selected?.agent && <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="font-semibold">Edit agent</h2>
            <input value={editAgentName} onChange={(event) => setEditAgentName(event.target.value)} placeholder="Agent name" className="mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <input value={editAgentRole} onChange={(event) => setEditAgentRole(event.target.value)} placeholder="Role" className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <input value={editAgentStatus} onChange={(event) => setEditAgentStatus(event.target.value)} placeholder="Status" className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <textarea value={editAgentGoal} onChange={(event) => setEditAgentGoal(event.target.value)} placeholder="Goal" className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <textarea value={editCapabilities} onChange={(event) => setEditCapabilities(event.target.value)} className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)' }} rows={3} aria-label="Capabilities JSON" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={patchSelectedAgent} className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>Save agent</button>
              <button type="button" onClick={() => window.confirm('Delete this Agent and its F1 hierarchy node? Non-agent nodes are archived instead of physically deleted.') && submit('deleteAgent', {}, { agentId: selected.agent!.id })} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>Delete agent</button>
            </div>
          </section>}

          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="font-semibold">Create hierarchy node</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{selectedParent && childLevel && childLevel !== 'agent' ? `Parent: ${selectedParent.name} → ${labels[childLevel]}` : 'Select a valid parent, or create a root Agency.'}</p>
            <input value={nodeName} onChange={(e) => setNodeName(e.target.value)} placeholder="Node name" className="mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <button type="button" onClick={() => nodeName && submit('createNode', { name: nodeName, level: selectedParent && childLevel && childLevel !== 'agent' ? childLevel : 'agency', parentId: selectedParent && childLevel && childLevel !== 'agent' ? selectedParent.id : null })} className="mt-2 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>Create node</button>
          </section>

          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="font-semibold">Create agent</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Agents are valid children of Workspace nodes.</p>
            <select className="mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} value={selectedParent?.level === 'workspace' ? selectedParent.id : workspaceNodes[0]?.id ?? ''} onChange={(e) => setSelected(allNodes.find((node) => node.id === e.target.value) ?? selected)}>
              {workspaceNodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
            </select>
            <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Agent name" className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <input value={agentRole} onChange={(e) => setAgentRole(e.target.value)} placeholder="Role" className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <textarea value={agentGoal} onChange={(e) => setAgentGoal(e.target.value)} placeholder="Goal" className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <button type="button" onClick={() => agentName && workspaceNodes[0] && submit('createAgent', { name: agentName, role: agentRole, goal: agentGoal, hierarchyLevel: 'agent', hierarchyParentId: (selectedParent?.level === 'workspace' ? selectedParent.id : workspaceNodes[0]?.id), capabilities: [] })} className="mt-2 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>Create agent</button>
          </section>
        </aside>
      </div>
    </div>
  );
}
