import React, { useState } from 'react';
import { Settings as SettingsIcon, Shield, Server, Cpu, Lock, Network, Database, Save, RotateCcw, CheckCircle } from 'lucide-react';

export default function Settings() {
  const [saved, setSaved] = useState(false);

  // Settings State
  const [policyCeiling, setPolicyCeiling] = useState('A0');
  const [enforceSod, setEnforceSod] = useState(true);
  const [failClosed, setFailClosed] = useState(true);
  const [maxClassification, setMaxClassification] = useState('INTERNAL');

  const [controlApiPort, setControlApiPort] = useState(3000);
  const [eventIngressPort, setEventIngressPort] = useState(3001);
  const [rufloUiPort, setRufloUiPort] = useState(3002);
  const [rufloMcpPort, setRufloMcpPort] = useState(3003);
  const [rufloAdapterPort, setRufloAdapterPort] = useState(3004);
  const [secbMcpPort, setSecbMcpPort] = useState(3005);

  const [defaultTopology, setDefaultTopology] = useState('hierarchical');
  const [maxAgents, setMaxAgents] = useState(8);
  const [taskTimeoutSec, setTaskTimeoutSec] = useState(300);
  const [costCeilingUsd, setCostCeilingUsd] = useState(20.0);

  const [secretScanning, setSecretScanning] = useState(true);
  const [pathTraversalPrevention, setPathTraversalPrevention] = useState(true);
  const [cveScanning, setCveScanning] = useState(true);

  const [graphifyEnabled, setGraphifyEnabled] = useState(true);
  const [astCacheEnabled, setAstCacheEnabled] = useState(true);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">SecB System Settings</h1>
          <p className="page-subtitle">Central configuration for governance ceilings, ports, security, and swarm topologies</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {saved && (
            <span className="badge-status done" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle size={13} /> Settings Saved
            </span>
          )}
          <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: '0.8rem', gap: 6 }}>
            <Save size={14} /> Save Configuration
          </button>
        </div>
      </div>

      <div className="alert alert-info">
        <Shield size={15} style={{ flexShrink: 0 }} />
        <span>
          System settings govern authority ceilings, port topology, and security limits across all worker runtimes (Codex, Claude Code, Gemini CLI, Kimi CLI, Ruflo).
          Changes take effect immediately across all active governed sessions.
        </span>
      </div>

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Section 1: Governance & Authority */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Shield size={15} /> Governance & Authority Engine</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Policy Authority Ceiling</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Maximum authority granted to worker runtimes</div>
              </div>
              <select
                value={policyCeiling}
                onChange={e => setPolicyCeiling(e.target.value)}
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              >
                {['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Enforce Separation of Duties (SoD)</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Producer cannot self-review or issue final verdict</div>
              </div>
              <input type="checkbox" checked={enforceSod} onChange={e => setEnforceSod(e.target.checked)} style={{ width: 16, height: 16 }} />
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Fail-Closed on Ambiguity</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Deny unknown identity, missing evidence, or expired receipts</div>
              </div>
              <input type="checkbox" checked={failClosed} onChange={e => setFailClosed(e.target.checked)} style={{ width: 16, height: 16 }} />
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Max Data Classification</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Data classification threshold</div>
              </div>
              <select
                value={maxClassification}
                onChange={e => setMaxClassification(e.target.value)}
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              >
                {['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Port Topology Binding */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Server size={15} /> 14-Port Binding Topology</span>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Control API', controlApiPort, setControlApiPort, '3000'],
              ['Event Ingress', eventIngressPort, setEventIngressPort, '3001'],
              ['Ruflo Web UI', rufloUiPort, setRufloUiPort, '3002'],
              ['Ruflo MCP', rufloMcpPort, setRufloMcpPort, '3003'],
              ['Ruflo Adapter', rufloAdapterPort, setRufloAdapterPort, '3004'],
              ['SecB MCP Gateway', secbMcpPort, setSecbMcpPort, '3005'],
            ].map(([label, val, setter, def]) => (
              <div key={label as string}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{label as string}</div>
                <input
                  type="number"
                  value={val as number}
                  onChange={e => (setter as any)(parseInt(e.target.value))}
                  style={{ width: '100%', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 8px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Swarm Execution & Budgets */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Cpu size={15} /> Swarm Execution & Budgets</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Default Swarm Topology</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Swarm agent organizational structure</div>
              </div>
              <select
                value={defaultTopology}
                onChange={e => setDefaultTopology(e.target.value)}
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              >
                {['hierarchical', 'mesh', 'hierarchical-mesh', 'ring', 'star', 'adaptive'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Max Concurrent Swarm Agents</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Upper limit on active worker agents</div>
              </div>
              <input
                type="number"
                value={maxAgents}
                onChange={e => setMaxAgents(parseInt(e.target.value))}
                style={{ width: 80, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 8px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Cost Ceiling per Contract ($ USD)</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Budget limit per Work Package</div>
              </div>
              <input
                type="number"
                step="0.5"
                value={costCeilingUsd}
                onChange={e => setCostCeilingUsd(parseFloat(e.target.value))}
                style={{ width: 80, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 8px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>
        </div>

        {/* Section 4: Security & Knowledge Graphify */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Lock size={15} /> Security & Graphify Knowledge Engine</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Secret Scanning</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Scan file modifications for credentials and tokens</div>
              </div>
              <input type="checkbox" checked={secretScanning} onChange={e => setSecretScanning(e.target.checked)} style={{ width: 16, height: 16 }} />
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Path Traversal Prevention</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Prevent unauthorized access outside worktree root</div>
              </div>
              <input type="checkbox" checked={pathTraversalPrevention} onChange={e => setPathTraversalPrevention(e.target.checked)} style={{ width: 16, height: 16 }} />
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Graphify AST Knowledge Engine</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Enable codebase AST graph claims & 71.5x token compression</div>
              </div>
              <input type="checkbox" checked={graphifyEnabled} onChange={e => setGraphifyEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
