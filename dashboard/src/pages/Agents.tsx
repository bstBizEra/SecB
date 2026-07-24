import React from 'react';
import { Users, Shield } from 'lucide-react';

const ADAPTERS = [
  {
    key: 'ruflo-swarm',
    name: 'Ruflo Swarm Coordinator',
    profile: 'ruflo-swarm-coordinator',
    version: '3.32.9',
    ceiling: 'A1',
    roles: ['ENGIN', 'ARCH', 'SEC'],
    classification: 'INTERNAL',
    tools: ['swarm_init', 'agent_spawn', 'task_orchestrate', 'memory_store', 'memory_search'],
    evidence: ['context-receipt', 'event-envelope', 'outcome-receipt', 'agent-registration'],
    status: 'CANDIDATE',
  },
  {
    key: 'ruflo-coder',
    name: 'Ruflo Coder Agent',
    profile: 'ruflo-coder',
    version: '3.32.9',
    ceiling: 'A0',
    roles: ['ENGIN'],
    classification: 'INTERNAL',
    tools: ['read', 'edit', 'write', 'grep', 'bash'],
    evidence: ['context-receipt', 'event-envelope'],
    status: 'CANDIDATE',
  },
  {
    key: 'ruflo-reviewer',
    name: 'Ruflo Reviewer Agent',
    profile: 'ruflo-reviewer',
    version: '3.32.9',
    ceiling: 'A0',
    roles: ['ENGIN', 'QA'],
    classification: 'INTERNAL',
    tools: ['read', 'grep'],
    evidence: ['context-receipt', 'event-envelope', 'outcome-receipt'],
    status: 'CANDIDATE',
  },
];

export default function Agents() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Registry</h1>
          <p className="page-subtitle">SecB-governed Ruflo adapter profiles — SoD roles and authority ceilings</p>
        </div>
        <span className="badge-status pending">CANDIDATE — GOV ratification pending</span>
      </div>

      <div className="alert alert-info">
        <Shield size={15} style={{ flexShrink: 0 }} />
        <span>All adapters are in <strong>CANDIDATE / PENDING</strong> lifecycle state until merged to <code style={{ fontFamily: 'var(--font-mono)' }}>main</code> and ratified by the operator. Authority ceilings apply immediately upon registration.</span>
      </div>

      <div className="agent-grid">
        {ADAPTERS.map(a => (
          <div className="agent-card" key={a.key}>
            <div className="agent-header">
              <div>
                <div className="agent-name">{a.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{a.key}</div>
              </div>
              <span className="badge-status pending" style={{ fontSize: '0.65rem' }}>{a.status}</span>
            </div>

            <div className="divider" />

            <div className="agent-meta">
              {[
                ['Profile', a.profile],
                ['Version', a.version],
                ['Auth ceiling', a.ceiling],
                ['Max classification', a.classification],
              ].map(([k, v]) => (
                <div className="agent-meta-row" key={k}>
                  <span className="agent-meta-key">{k}</span>
                  <span className="agent-meta-val">{v}</span>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>Permitted roles</div>
              <div>{a.roles.map(r => <span key={r} className="role-chip">{r}</span>)}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>Evidence obligations</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {a.evidence.map(e => (
                  <span key={e} style={{
                    fontSize: '0.68rem',
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-mid)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)'
                  }}>{e}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
