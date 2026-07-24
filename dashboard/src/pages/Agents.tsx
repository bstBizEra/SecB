import React, { useState } from 'react';
import { Users, Shield, Cpu, Terminal, Server, Layers, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', models: ['claude-opus-4-6', 'claude-sonnet-4-6'], status: 'active' },
  { id: 'openai', name: 'OpenAI', models: ['gpt-5.3-codex', 'gpt-4o'], status: 'active' },
  { id: 'google', name: 'Google AI', models: ['gemini-3.6-pro', 'gemini-3.6-flash'], status: 'active' },
  { id: 'moonshot', name: 'Moonshot AI', models: ['kimi-k1.5'], status: 'active' },
  { id: 'ruflo', name: 'Ruflo Swarm Provider', models: ['ruflo-v3-swarm'], status: 'active' },
];

const RUNTIMES = [
  { id: 'runtime.claude.local', name: 'Claude Code CLI', provider: 'Anthropic', executable: 'claude', status: 'ACTIVE', authority: 'A0' },
  { id: 'runtime.codex.local', name: 'Codex CLI', provider: 'OpenAI', executable: 'codex', status: 'ACTIVE', authority: 'A0' },
  { id: 'runtime.gemini.local', name: 'Gemini CLI', provider: 'Google AI', executable: 'gemini', status: 'ACTIVE', authority: 'A0' },
  { id: 'runtime.kimi.local', name: 'Kimi CLI', provider: 'Moonshot AI', executable: 'kimi', status: 'INSPECTED', authority: 'A0' },
  { id: 'RT-RUFLO-LOCAL-001', name: 'Ruflo Local Sidecar', provider: 'Ruflo', executable: 'npx claude-flow', status: 'ACTIVE', authority: 'A2' },
];

const AGENTS = [
  { id: 'codex-implementer-01', name: 'Codex Implementer', runtime: 'Codex CLI', role: 'ENGIN', ceiling: 'A0', model: 'gpt-5.3-codex', status: 'active' },
  { id: 'claude-reviewer-01', name: 'Claude Reviewer', runtime: 'Claude Code CLI', role: 'QA / REV', ceiling: 'A0', model: 'claude-sonnet-4-6', status: 'active' },
  { id: 'gemini-scout-01', name: 'Gemini Researcher', runtime: 'Gemini CLI', role: 'RESEARCH', ceiling: 'A0', model: 'gemini-3.6-flash', status: 'active' },
  { id: 'ruflo-swarm-coord', name: 'Ruflo Swarm Lead', runtime: 'Ruflo Local Sidecar', role: 'ENGIN / ARCH / SEC', ceiling: 'A1', model: 'ruflo-v3-swarm', status: 'active' },
];

const SESSIONS = [
  { id: 'SESS-2026-0042', agent: 'codex-implementer-01', package: 'WP-SECB-P0-016', worktree: 'C:/laragon/www/SecB-worktrees/WP-016', pid: 14820, state: 'RUNNING' },
  { id: 'SESS-2026-0041', agent: 'claude-reviewer-01', package: 'WP-SECB-P0-015', worktree: 'C:/laragon/www/SecB', pid: 9812, state: 'COMPLETED' },
];

export default function Agents() {
  const [activeTab, setActiveTab] = useState<'agents' | 'runtimes' | 'providers' | 'sessions'>('agents');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">5-Layer Agent & Runtime Registry</h1>
          <p className="page-subtitle">ADR-SECB-AGENT-RUNTIME-001 — Provider-neutral governed agent architecture</p>
        </div>
        <span className="badge-status done">ADR-SECB-AGENT-RUNTIME-001 ACTIVE</span>
      </div>

      <div className="alert alert-info">
        <Shield size={15} style={{ flexShrink: 0 }} />
        <span>
          SecB separates <strong>Providers</strong>, <strong>Models</strong>, <strong>Runtimes</strong>, <strong>Agent Identities</strong>, and <strong>Active Sessions</strong>.
          No model self-authorizes mutation — all work is governed by SecB Work Package leases and AuthorityEngine rules.
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
        {[
          { id: 'agents', label: 'Layer 4: Agents', icon: Users, count: AGENTS.length },
          { id: 'runtimes', label: 'Layer 3: Runtimes & Lifecycle', icon: Terminal, count: RUNTIMES.length },
          { id: 'providers', label: 'Layer 1 & 2: Providers & Models', icon: Server, count: PROVIDERS.length },
          { id: 'sessions', label: 'Layer 5: Active Sessions', icon: Layers, count: SESSIONS.length },
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className="btn btn-ghost"
              style={{
                fontSize: '0.8rem',
                padding: '6px 14px',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                color: isActive ? 'var(--accent-light)' : 'var(--text-secondary)',
                border: isActive ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              }}
            >
              <Icon size={14} /> {t.label}
              <span className="badge-count" style={{ marginLeft: 6 }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Layer 4: Agents */}
      {activeTab === 'agents' && (
        <div className="agent-grid">
          {AGENTS.map(a => (
            <div className="agent-card" key={a.id}>
              <div className="agent-header">
                <div>
                  <div className="agent-name">{a.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{a.id}</div>
                </div>
                <span className="badge-status done" style={{ fontSize: '0.65rem' }}>{a.status}</span>
              </div>

              <div className="divider" />

              <div className="agent-meta">
                {[
                  ['Runtime', a.runtime],
                  ['Model', a.model],
                  ['Auth ceiling', a.ceiling],
                  ['Role', a.role],
                ].map(([k, v]) => (
                  <div className="agent-meta-row" key={k}>
                    <span className="agent-meta-key">{k}</span>
                    <span className="agent-meta-val">{v}</span>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>Governance Boundary</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="role-chip">{a.role}</span>
                  <span className="role-chip" style={{ background: 'var(--accent-glow)', color: 'var(--accent-light)' }}>Ceiling: {a.ceiling}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Layer 3: Runtimes */}
      {activeTab === 'runtimes' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Terminal size={15} /> Registered CLI Runtimes & Onboarding Lifecycle</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DISCOVERED → INSPECTED → ACTIVE</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Runtime ID</th>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Executable</th>
                  <th>Lifecycle Status</th>
                  <th>Authority Ceiling</th>
                </tr>
              </thead>
              <tbody>
                {RUNTIMES.map(r => (
                  <tr key={r.id}>
                    <td className="mono primary">{r.id}</td>
                    <td>{r.name}</td>
                    <td>{r.provider}</td>
                    <td className="mono" style={{ color: 'var(--text-code)' }}>{r.executable}</td>
                    <td>
                      <span className={`badge-status ${r.status === 'ACTIVE' ? 'done' : 'pending'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="mono">{r.authority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Layer 1 & 2: Providers & Models */}
      {activeTab === 'providers' && (
        <div className="agent-grid">
          {PROVIDERS.map(p => (
            <div className="agent-card" key={p.id}>
              <div className="agent-header">
                <div>
                  <div className="agent-name">{p.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{p.id}</div>
                </div>
                <span className="badge-status done" style={{ fontSize: '0.65rem' }}>{p.status}</span>
              </div>
              <div className="divider" />
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>Supported Reasoning Models</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {p.models.map(m => (
                    <div key={m} className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-code)', padding: '2px 6px', background: 'var(--bg-elevated)', borderRadius: 4 }}>
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Layer 5: Active Sessions */}
      {activeTab === 'sessions' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Layers size={15} /> Active Governed Execution Sessions</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Agent Identity</th>
                  <th>Work Package</th>
                  <th>PID</th>
                  <th>Worktree Root</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {SESSIONS.map(s => (
                  <tr key={s.id}>
                    <td className="mono primary">{s.id}</td>
                    <td className="mono">{s.agent}</td>
                    <td className="mono" style={{ color: 'var(--accent-light)' }}>{s.package}</td>
                    <td className="mono">{s.pid ?? '—'}</td>
                    <td className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.worktree}</td>
                    <td>
                      <span className={`badge-status ${s.state === 'RUNNING' ? 'pending' : 'done'}`}>
                        {s.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
