'use client';

import { useMemo, useState } from 'react';
import type { AgentGraphNode } from '@/lib/agent-graph';

type Props = { initialNodes: AgentGraphNode[]; writesConfigured: boolean; initialError?: string | undefined };
type Level = AgentGraphNode['level'];

const nextLevel: Record<Level, Level | null> = { agency: 'department', department: 'workspace', workspace: 'agent', agent: null };
const labels: Record<Level, string> = { agency: 'Agency', department: 'Department', workspace: 'Workspace', agent: 'Agent' };

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
          <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-faint)' }}>{node.activationState}</span>
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

  const allNodes = useMemo(() => flatten(nodes), [nodes]);
  const workspaceNodes = allNodes.filter((node) => node.level === 'workspace');
  const selectedParent = selected && nextLevel[selected.level] ? selected : workspaceNodes[0] ?? null;

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

  async function submit(action: 'createNode' | 'createAgent', body: Record<string, unknown>) {
    if (!writesConfigured) {
      setError('Authenticated F1 Agent Graph console writes are not configured; reads remain available through the server projection.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/agent-graph', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, body }) });
      if (!res.ok) {
        const failure = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(failure.error ?? failure.message ?? `Write failed with HTTP ${res.status}`);
      }
      const created = (await res.json()) as { id?: string; hierarchyNodeId?: string };
      await refresh(created.hierarchyNodeId ?? created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Write failed');
      setLoading(false);
    }
  }

  const childLevel = selectedParent ? nextLevel[selectedParent.level] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase" style={{ color: 'var(--color-primary)' }}>F1 · Agent Graph System</p>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Agent Graph Console</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Operational F1 graph projection: Agency → Department → Workspace → Agent. UI projects hierarchy/state only; Control Plane validates and persists transitions, while runtime execution and streaming remain outside F1.</p>
        </div>
        <button type="button" onClick={() => refresh()} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>{loading ? 'Refreshing…' : 'Refresh graph'}</button>
      </div>

      {(error || initialError) && <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(248,81,73,0.08)', color: 'var(--color-error)' }}>{error || initialError}</div>}

      {nodes.length === 0 ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h2 className="font-semibold">No hierarchy persisted yet</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Create an Agency below, then Department, Workspace and Agent. Runtime status remains explicitly unavailable in F1; real execution and streaming projections are deferred to F2/F3+.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
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
              <p className="text-sm">Activation: <strong>{selected.activationState}</strong></p>
              <p className="text-sm">Runtime: <strong>{selected.runtimeStatus ?? 'not available'}</strong></p>
              {selected.agent && <p className="text-sm">Agent status: <strong>{selected.agent.status}</strong> · role {selected.agent.role}</p>}
              <div><h4 className="mb-1 text-xs font-semibold uppercase">Effective capabilities</h4><JsonBlock value={selected.effectiveCapabilities} emptyLabel="No effective capabilities configured." /></div>
              <div><h4 className="mb-1 text-xs font-semibold uppercase">Effective policies</h4><JsonBlock value={selected.effectivePolicies} emptyLabel="No effective policies configured." /></div>
            </div> : <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Select a graph node to inspect it.</p>}
          </section>

          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="font-semibold">Create hierarchy node</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{selectedParent && childLevel ? `Parent: ${selectedParent.name} → ${labels[childLevel]}` : 'Select a valid parent, or create a root Agency.'}</p>
            <input value={nodeName} onChange={(e) => setNodeName(e.target.value)} placeholder="Node name" className="mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => nodeName && submit('createNode', { name: nodeName, level: selectedParent && childLevel ? childLevel : 'agency', parentId: selectedParent && childLevel ? selectedParent.id : null })} className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>Create node</button>
            </div>
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
