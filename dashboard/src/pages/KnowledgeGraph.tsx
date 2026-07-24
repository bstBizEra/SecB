import React, { useState } from 'react';
import { Network, Database, Code, FileText, Shield, Search, RefreshCw, Zap, Folder, Layers, Cpu } from 'lucide-react';

interface NodeItem {
  id: string;
  name: string;
  type: 'class' | 'contract' | 'ledger' | 'schema' | 'service' | 'memory' | 'governance';
  file: string;
  connections: number;
  isGodNode?: boolean;
}

interface EdgeItem {
  source: string;
  target: string;
  relationship: string;
}

// ── 1. SecB System & Memory Graph ──
const SECB_NODES: NodeItem[] = [
  { id: 'AuthorityEngine', name: 'AuthorityEngine', type: 'service', file: 'src/engine/authority.mjs', connections: 8, isGodNode: true },
  { id: 'RuntimeRegistry', name: 'RuntimeRegistry', type: 'service', file: 'src/registry/five-layer-registry.mjs', connections: 6, isGodNode: true },
  { id: 'SwarmExecutionContract', name: 'SwarmExecutionContract', type: 'contract', file: 'contracts/swarm-execution-contract.schema.json', connections: 5 },
  { id: 'EventLedger', name: 'EventLedger', type: 'ledger', file: 'src/ledger/governed-ledgers.mjs', connections: 7, isGodNode: true },
  { id: 'EvidenceLedger', name: 'EvidenceLedger', type: 'ledger', file: 'src/ledger/governed-ledgers.mjs', connections: 6 },
  { id: 'WorkPackage', name: 'WorkPackage', type: 'contract', file: 'contracts/work-package.schema.json', connections: 9, isGodNode: true },
  { id: 'EventNormalizer', name: 'EventNormalizer', type: 'service', file: 'src/events/event-normalizer.mjs', connections: 4 },
  { id: 'GraphifyAdapter', name: 'GraphifyAdapter', type: 'service', file: 'src/plugins/secb-graphify-adapter.mjs', connections: 3 },
  { id: 'PatternMemoryCluster', name: 'PatternMemoryCluster', type: 'memory', file: '.swarm/memory.db', connections: 5, isGodNode: true },
  { id: 'HNSWVectorIndex', name: 'HNSWVectorIndex', type: 'memory', file: 'agentdb.rvf', connections: 4 },
];

const SECB_EDGES: EdgeItem[] = [
  { source: 'AuthorityEngine', target: 'WorkPackage', relationship: 'governs' },
  { source: 'RuntimeRegistry', target: 'SwarmExecutionContract', relationship: 'binds_deployment' },
  { source: 'SwarmExecutionContract', target: 'WorkPackage', relationship: 'executes' },
  { source: 'RufloCommandBridge', target: 'EventNormalizer', relationship: 'normalizes_telemetry' },
  { source: 'EventNormalizer', target: 'EventLedger', relationship: 'appends_envelope' },
  { source: 'GraphifyAdapter', target: 'EvidenceLedger', relationship: 'publishes_knowledge_claims' },
  { source: 'WorkPackage', target: 'EvidenceLedger', relationship: 'requires_evidence' },
  { source: 'PatternMemoryCluster', target: 'HNSWVectorIndex', relationship: 'indexes_vectors' },
  { source: 'HNSWVectorIndex', target: 'AuthorityEngine', relationship: 'recommends_policy' },
];

// ── 2. Ruflo Swarm System Graph ──
const RUFLO_NODES: NodeItem[] = [
  { id: 'SwarmCoordinator', name: 'SwarmCoordinator', type: 'service', file: 'v3/src/swarm/coordinator.ts', connections: 12, isGodNode: true },
  { id: 'AgentPool', name: 'AgentPool', type: 'service', file: 'v3/src/agents/pool.ts', connections: 7 },
  { id: 'SONANeuralEngine', name: 'SONANeuralEngine', type: 'memory', file: 'v3/src/neural/sona.ts', connections: 6, isGodNode: true },
  { id: 'AgentDBVectorStore', name: 'AgentDBVectorStore', type: 'memory', file: 'v3/src/memory/agentdb.ts', connections: 8, isGodNode: true },
  { id: 'SwarmConfig', name: 'SwarmConfig', type: 'schema', file: 'v3/swarm.config.ts', connections: 5 },
];

const RUFLO_EDGES: EdgeItem[] = [
  { source: 'SwarmCoordinator', target: 'AgentPool', relationship: 'spawns_workers' },
  { source: 'SwarmCoordinator', target: 'SwarmConfig', relationship: 'reads_topology' },
  { source: 'AgentPool', target: 'SONANeuralEngine', relationship: 'learns_from_edits' },
  { source: 'SONANeuralEngine', target: 'AgentDBVectorStore', relationship: 'persists_embeddings' },
];

export default function KnowledgeGraph() {
  const [selectedProject, setSelectedProject] = useState<'SecB' | 'Ruflo' | 'Custom'>('SecB');
  const [customPath, setCustomPath] = useState('');
  const [graphMode, setGraphMode] = useState<'ast' | 'system' | 'memory'>('ast');
  const [searchTerm, setSearchTerm] = useState('');

  const nodes = selectedProject === 'Ruflo' ? RUFLO_NODES : SECB_NODES;
  const edges = selectedProject === 'Ruflo' ? RUFLO_EDGES : SECB_EDGES;

  const filteredNodes = nodes.filter(n => {
    const matchesSearch = n.name.toLowerCase().includes(searchTerm.toLowerCase()) || n.file.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMode =
      graphMode === 'ast' ? (n.type === 'service' || n.type === 'class' || n.type === 'contract') :
      graphMode === 'memory' ? (n.type === 'memory' || n.type === 'ledger') : true;
    return matchesSearch && matchesMode;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Project System & Memory Graph</h1>
          <p className="page-subtitle">Multi-project AST symbols, System Governance DAG, and AgentDB Memory Clusters</p>
        </div>
        <span className="badge-status done">Graphify Engine Ready</span>
      </div>

      {/* Project & View Mode Selector */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Folder size={15} color="var(--accent-light)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Project Target:</span>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value as any)}
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
          >
            <option value="SecB">SecB Control Plane (c:/laragon/www/SecB)</option>
            <option value="Ruflo">Ruflo Swarm Engine (c:/laragon/www/ruflo)</option>
            <option value="Custom">Custom Project Directory…</option>
          </select>
        </div>

        {selectedProject === 'Custom' && (
          <input
            type="text"
            placeholder="Enter directory path (e.g. C:/projects/my-app)..."
            value={customPath}
            onChange={e => setCustomPath(e.target.value)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontSize: '0.78rem', padding: '4px 10px', borderRadius: 6, width: 260 }}
          />
        )}

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {[
            { id: 'ast', label: 'AST & Code Graph', icon: Code },
            { id: 'system', label: 'System Governance DAG', icon: Layers },
            { id: 'memory', label: 'Memory & Neural Graph', icon: Database },
          ].map(m => {
            const Icon = m.icon;
            const active = graphMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setGraphMode(m.id as any)}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  background: active ? 'var(--accent-glow)' : 'transparent',
                  color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent'
                }}
              >
                <Icon size={12} /> {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Info Alert */}
      <div className="alert alert-info" style={{ marginTop: -4 }}>
        <Network size={15} style={{ flexShrink: 0 }} />
        <span>
          Showing <strong>{graphMode.toUpperCase()} Graph</strong> for project <strong>{selectedProject}</strong>.
          AST relationships derived via Graphify Tree-sitter parsers (71.5x token compression). Memory claims bound to AgentDB HNSW index.
        </span>
      </div>

      {/* Control & Search Bar */}
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'var(--bg-card)', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-mid)' }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search nodes, symbols, or files..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.78rem', width: '100%', outline: 'none' }}
          />
        </div>

        <button className="btn btn-ghost" style={{ fontSize: '0.75rem', gap: 4 }}>
          <RefreshCw size={12} /> Re-scan {selectedProject}
        </button>
      </div>

      {/* Graph Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

        {/* Node Grid */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Code size={15} /> Graph Nodes ({filteredNodes.length})</span>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {filteredNodes.map(n => (
              <div
                key={n.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'var(--bg-elevated)',
                  border: n.isGodNode ? '1px solid var(--accent-light)' : '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{n.name}</span>
                  {n.isGodNode && (
                    <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 3, background: 'var(--accent-glow)', color: 'var(--accent-light)', fontWeight: 700 }}>
                      HUB NODE
                    </span>
                  )}
                </div>
                <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.file}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span>Type: <code className="mono">{n.type}</code></span>
                  <span>{n.connections} links</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edge Relationships */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Zap size={15} /> Edge Dependencies ({edges.length})</span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {edges.map((e, idx) => (
              <div key={idx} style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6, fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--accent-light)' }}>{e.source}</span>
                  <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                    {e.relationship}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>→ {e.target}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
