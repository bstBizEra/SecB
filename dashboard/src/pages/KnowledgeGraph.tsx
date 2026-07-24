import React, { useState } from 'react';
import { Network, Database, Code, FileText, Shield, Search, RefreshCw, Zap } from 'lucide-react';

interface NodeItem {
  id: string;
  name: string;
  type: 'class' | 'contract' | 'ledger' | 'schema' | 'service';
  file: string;
  connections: number;
  isGodNode?: boolean;
}

interface EdgeItem {
  source: string;
  target: string;
  relationship: string;
}

const NODES: NodeItem[] = [
  { id: 'AuthorityEngine', name: 'AuthorityEngine', type: 'service', file: 'src/engine/authority.mjs', connections: 8, isGodNode: true },
  { id: 'RuntimeRegistry', name: 'RuntimeRegistry', type: 'service', file: 'src/registry/five-layer-registry.mjs', connections: 6, isGodNode: true },
  { id: 'SwarmExecutionContract', name: 'SwarmExecutionContract', type: 'contract', file: 'contracts/swarm-execution-contract.schema.json', connections: 5 },
  { id: 'EventLedger', name: 'EventLedger', type: 'ledger', file: 'src/ledger/governed-ledgers.mjs', connections: 7, isGodNode: true },
  { id: 'EvidenceLedger', name: 'EvidenceLedger', type: 'ledger', file: 'src/ledger/governed-ledgers.mjs', connections: 6 },
  { id: 'WorkPackage', name: 'WorkPackage', type: 'contract', file: 'contracts/work-package.schema.json', connections: 9, isGodNode: true },
  { id: 'EventNormalizer', name: 'EventNormalizer', type: 'service', file: 'src/events/event-normalizer.mjs', connections: 4 },
  { id: 'RufloCommandBridge', name: 'RufloCommandBridge', type: 'service', file: 'src/gateway/ruflo-command-bridge.mjs', connections: 5 },
  { id: 'GraphifyAdapter', name: 'GraphifyAdapter', type: 'service', file: 'src/plugins/secb-graphify-adapter.mjs', connections: 3 },
];

const EDGES: EdgeItem[] = [
  { source: 'AuthorityEngine', target: 'WorkPackage', relationship: 'governs' },
  { source: 'RuntimeRegistry', target: 'SwarmExecutionContract', relationship: 'binds_deployment' },
  { source: 'SwarmExecutionContract', target: 'WorkPackage', relationship: 'executes' },
  { source: 'RufloCommandBridge', target: 'EventNormalizer', relationship: 'normalizes_telemetry' },
  { source: 'EventNormalizer', target: 'EventLedger', relationship: 'appends_envelope' },
  { source: 'GraphifyAdapter', target: 'EvidenceLedger', relationship: 'publishes_knowledge_claims' },
  { source: 'WorkPackage', target: 'EvidenceLedger', relationship: 'requires_evidence' },
];

export default function KnowledgeGraph() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredNodes = NODES.filter(n => {
    const matchesSearch = n.name.toLowerCase().includes(searchTerm.toLowerCase()) || n.file.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || n.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Graphify AST Knowledge Graph</h1>
          <p className="page-subtitle">SECB-RESEARCH-GRAPHIFY-001 — AST codebase relationships & KnowledgeClaims</p>
        </div>
        <span className="badge-status done">71.5x Token Compression Active</span>
      </div>

      <div className="alert alert-info">
        <Network size={15} style={{ flexShrink: 0 }} />
        <span>
          Graphify parses SecB source code using local AST grammars (Tree-sitter) into persistent knowledge claims (`KCLAIM-GRAPHIFY-*`).
          Agents query codebase relationships via <code style={{ fontFamily: 'var(--font-mono)' }}>graphify query</code> without re-reading raw source files.
        </span>
      </div>

      {/* Control Bar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-mid)' }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search symbols or files (e.g. AuthorityEngine)..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', width: '100%', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'service', 'contract', 'ledger'].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className="btn btn-ghost"
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                textTransform: 'capitalize',
                background: filterType === t ? 'var(--accent-glow)' : 'transparent',
                color: filterType === t ? 'var(--accent-light)' : 'var(--text-muted)'
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <button className="btn btn-ghost" style={{ fontSize: '0.75rem', gap: 4 }}>
          <RefreshCw size={12} /> Re-index AST
        </button>
      </div>

      {/* Grid Layout: Symbol Nodes & Relationships */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

        {/* Node Grid */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Code size={15} /> Indexed Codebase Symbols & God Nodes</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{filteredNodes.length} symbols found</span>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
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
                      GOD NODE
                    </span>
                  )}
                </div>
                <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.file}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span>Type: <code className="mono">{n.type}</code></span>
                  <span>{n.connections} connections</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edge Relationships */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Zap size={15} /> Symbol Relationship Graph</span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EDGES.map((e, idx) => (
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
