import React from 'react';
import { CheckCircle, Shield, GitCommit, AlertCircle } from 'lucide-react';

const WORK_ITEMS = [
  { step: '1–3', description: 'Accept MANIFEST, advance base, rebuild SKEL', owner: 'Mixed', status: 'done' },
  { step: '5',   description: 'Independent receipt on f1eea272 — ACCEPT_EXACT_SHA (authoritative + supplementary agree)', owner: 'Agent', status: 'done' },
  { step: '4',   description: 'Authorize pnpm-lock.yaml scope (SKEL-P0-01)', owner: 'HUMAN-OPERATOR-001', status: 'done' },
  { step: '6',   description: 'ACCEPT_WORK_ITEM SKEL-P0-01 at exact SHA f1eea272', owner: 'HUMAN-OPERATOR-001', status: 'done' },
];

const STATS = [
  { label: 'Phase', value: 'P0', sub: 'Constitution / contracts', color: 'var(--accent-light)' },
  { label: 'Tests passing', value: '580', sub: 'canonical gate clean', color: 'var(--status-done)' },
  { label: 'Gates closed', value: '3', sub: 'MANIFEST + SKEL-P0-01 accepted', color: 'var(--status-done)' },
  { label: 'Gates pending', value: '0', sub: 'SKEL-P0-01 gate complete', color: 'var(--status-done)' },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { done: '✓ Done', pending: '⏳ Pending', blocked: '✗ Blocked', closed: '● Closed' };
  return <span className={`badge-status ${status}`}>{map[status] ?? status}</span>;
}

export default function Overview() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operations Overview</h1>
          <p className="page-subtitle">SKEL-P0-01 governance path — ALL STEPS COMPLETED & ACCEPTED</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="sha-block" style={{ minWidth: 'auto', gap: 8, fontSize: '0.75rem' }}>
            <GitCommit size={13} /> candidate @ <strong>f1eea272</strong>
          </span>
        </div>
      </div>

      <div className="alert alert-success">
        <CheckCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>SKEL-P0-01 ACCEPTED.</strong> Human attestation by <code>HUMAN-OPERATOR-001</code> recorded.
          Scope amendment authorized and candidate SHA <code>f1eea272442a0587ab5843ba28c6ce47b91e1615</code> accepted.
          <em>Note: PG-P1 remains closed pending its own separate signed transition.</em>
        </div>
      </div>

      <div className="stats-row">
        {STATS.map(s => (
          <div className="stat-card" key={s.label}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color }}>{s.value}</span>
            <span className="stat-sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><Shield size={15} /> SKEL-P0-01 Work Package — Path B</span>
          <StatusBadge status="done" />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Step</th>
                <th>Description</th>
                <th style={{ width: 180 }}>Owner</th>
                <th style={{ width: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {WORK_ITEMS.map(item => (
                <tr key={item.step}>
                  <td className="primary mono">{item.step}</td>
                  <td>{item.description}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-code)' }}>{item.owner}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Closed gates & Attestations</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="alert alert-success">
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span><strong>SKEL-P0-01 ACCEPTED</strong> — Operator attestation on file for exact SHA <code>f1eea272442a0587ab5843ba28c6ce47b91e1615</code> by <code>HUMAN-OPERATOR-001</code>.</span>
          </div>
          <div className="alert alert-success">
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span><strong>Independent review gate — CLOSED.</strong> Authoritative receipt (WSL BST-Codex-Motor) and supplementary agree. Both checkers confirm byte-level independence: one Claude-authored candidate commit; no Codex-authored commit in the delta. 580 tests passing, lockfile only the two importers, no manifest-tool or governance changes.</span>
          </div>
          <div className="alert alert-success">
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span><strong>MANIFEST accepted</strong> — operator attestation on file. Steps 1–3 and 5 verified.</span>
          </div>
        </div>
      </div>
    </>
  );
}
