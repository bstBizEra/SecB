import React, { useState, useEffect } from 'react';
import { Cpu, RefreshCw, ExternalLink } from 'lucide-react';

const MOCK_AGENTS = [
  { name: 'swarm-coord-1', type: 'coordinator', status: 'idle', swarm: 'swarm-secb-001' },
  { name: 'coder-1', type: 'coder', status: 'idle', swarm: 'swarm-secb-001' },
  { name: 'tester-1', type: 'tester', status: 'idle', swarm: 'swarm-secb-001' },
  { name: 'reviewer-1', type: 'reviewer', status: 'idle', swarm: 'swarm-secb-001' },
];

const MOCK_STATS = { taskCount: 0, successCount: 0, passRate: 'N/A', swarmStatus: 'STOPPED' };

export default function Swarm() {
  const [connected, setConnected] = useState(false);
  const [stats] = useState(MOCK_STATS);
  const [agents] = useState(MOCK_AGENTS);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ruflo Swarm</h1>
          <p className="page-subtitle">Live telemetry from Ruflo command center via RufloCommandBridge</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="http://localhost:3002" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: '0.8rem', gap: 6 }}>
            <ExternalLink size={13} /> Open Ruflo UI
          </a>
          <button className="btn btn-ghost" style={{ gap: 6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label: 'Swarm status', value: stats.swarmStatus, color: 'var(--text-muted)' },
          { label: 'Active agents', value: agents.filter(a => a.status === 'active').length.toString(), color: 'var(--status-done)' },
          { label: 'Tasks completed', value: stats.taskCount.toString(), color: 'var(--accent-light)' },
          { label: 'Pass rate', value: stats.passRate, color: 'var(--status-done)' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.1rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><Cpu size={15} /> Registered agents</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Governed by SecB SoD rules</span>
        </div>
        <div className="card-body">
          <div className="swarm-grid">
            {agents.map(a => (
              <div key={a.name} className="swarm-agent">
                <div className={`swarm-agent-dot ${a.status}`} />
                <div className="swarm-agent-info">
                  <div className="swarm-agent-name">{a.name}</div>
                  <div className="swarm-agent-type">{a.type} · {a.swarm}</div>
                </div>
                <span className="badge-status" style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-muted)',
                  fontSize: '0.68rem'
                }}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Quick launch</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            Start a Ruflo swarm that reports evidence back into SecB's ledger:
          </p>
          <div className="sha-block" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}># In c:/laragon/www/ruflo</span>
            <span>npx claude-flow swarm init --topology hierarchical</span>
            <span>npx claude-flow agent spawn --type coder --name coder-1</span>
            <span>npx claude-flow agent spawn --type tester --name tester-1</span>
            <span>npx claude-flow agent spawn --type reviewer --name reviewer-1</span>
            <span>npx claude-flow swarm start --objective "SecB task" --strategy development</span>
          </div>
        </div>
      </div>
    </>
  );
}
