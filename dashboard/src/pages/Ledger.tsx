import React, { useState } from 'react';
import { FileText, RefreshCw, Shield } from 'lucide-react';

// Static sample evidence entries — in production these poll SecB's MCP server
const SAMPLE_ENTRIES = [
  { id: 'ruflo-swarm-secb-001-1753401001', kind: 'evidence-envelope', type: 'swarm.completion', actor: 'ruflo-swarm-coordinator', ts: '2026-07-25T01:00:01Z', cls: 'INTERNAL' },
  { id: 'ruflo-outcome-task-001-1753400900', kind: 'outcome-receipt', type: 'task.success', actor: 'coder-1', ts: '2026-07-25T00:58:00Z', cls: 'INTERNAL' },
  { id: 'ruflo-spawn-coder-1-1753400800', kind: 'event-envelope', type: 'agent.spawn', actor: 'inst_ruflo_coder', ts: '2026-07-25T00:56:40Z', cls: 'INTERNAL' },
  { id: 'secb-evidence-skel-p0-01-review', kind: 'evidence-envelope', type: 'independent-review', actor: 'WSL-BST-Codex-Motor', ts: '2026-07-24T18:00:00Z', cls: 'INTERNAL' },
  { id: 'secb-event-manifest-accept', kind: 'event-envelope', type: 'manifest.accept', actor: 'HUMAN-OPERATOR-001', ts: '2026-07-24T10:00:00Z', cls: 'INTERNAL' },
];

const KIND_COLOR: Record<string, string> = {
  'evidence-envelope': 'var(--status-done)',
  'outcome-receipt': 'var(--accent-light)',
  'event-envelope': 'var(--status-pending)',
};

export default function Ledger() {
  const [entries] = useState(SAMPLE_ENTRIES);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Evidence Ledger</h1>
          <p className="page-subtitle">Append-only — all entries are read-only projections, not evidence themselves</p>
        </div>
        <button className="btn btn-ghost" style={{ gap: 6 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="alert alert-info">
        <Shield size={15} style={{ flexShrink: 0 }} />
        <span>This view is a read-only projection of SecB's DurableLedger. "Verified" attests internal chain consistency, not provenance. Re-verify the head hash against the ledger before acting.</span>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><FileText size={15} /> Ledger entries ({entries.length})</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Most recent first</span>
        </div>
        <div className="evidence-feed">
          <div style={{
            display: 'grid',
            gridTemplateColumns: '120px 140px 1fr 180px',
            gap: 12,
            padding: '8px 16px',
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border-subtle)'
          }}>
            <span>Kind</span>
            <span>Type</span>
            <span>Entry ID</span>
            <span>Timestamp</span>
          </div>
          {entries.map(e => (
            <div key={e.id} className="evidence-entry">
              <span style={{ color: KIND_COLOR[e.kind] ?? 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                {e.kind}
              </span>
              <span className="mono" style={{ color: 'var(--text-code)' }}>{e.type}</span>
              <span className="mono" style={{ fontSize: '0.73rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.id}</span>
              <span className="mono" style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{e.ts.slice(0, 19).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
