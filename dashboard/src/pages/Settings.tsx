import React, { useState } from 'react';
import { Settings as SettingsIcon, Shield, Server, Cpu, Lock, Network, Database, Save, CheckCircle, Terminal } from 'lucide-react';

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

  const [secretScanning, setSecretScanning] = useState(true);
  const [pathTraversalPrevention, setPathTraversalPrevention] = useState(true);

  // Graphify Settings
  const [graphifyEnabled, setGraphifyEnabled] = useState(true);
  const [graphifyBackend, setGraphifyBackend] = useState('code-only');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [graphifyTimeout, setGraphifyTimeout] = useState(600);
  const [graphifyWorkers, setGraphifyWorkers] = useState(8);
  const [graphifyMaxMb, setGraphifyMaxMb] = useState(512);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">SecB System Settings</h1>
          <p className="page-subtitle">Central configuration for governance ceilings, ports, security, and Graphify backends</p>
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
          System settings govern authority ceilings, port topology, security limits, and Graphify extraction backends across all worker runtimes (Codex, Claude Code, Gemini CLI, Kimi CLI, Ruflo).
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
          </div>
        </div>

        {/* Section 2: Port Topology Binding */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Server size={15} /> 14-Port Binding Topology</span>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Control API', controlApiPort, setControlApiPort],
              ['Event Ingress', eventIngressPort, setEventIngressPort],
              ['Ruflo Web UI', rufloUiPort, setRufloUiPort],
              ['Ruflo MCP', rufloMcpPort, setRufloMcpPort],
              ['Ruflo Adapter', rufloAdapterPort, setRufloAdapterPort],
              ['SecB MCP Gateway', secbMcpPort, setSecbMcpPort],
            ].map(([label, val, setter]) => (
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

        {/* Section 3: Graphify Backend & LLM Environment Settings */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <span className="card-title"><Terminal size={15} /> Graphify Multi-Backend & Model Environment</span>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>Extraction Backend (`--backend`)</div>
              <select
                value={graphifyBackend}
                onChange={e => setGraphifyBackend(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              >
                <option value="code-only">code-only (Tree-sitter AST, local, no API keys)</option>
                <option value="claude">claude (Anthropic Claude 4.6 Sonnet)</option>
                <option value="gemini">gemini (Google Gemini Flash/Pro)</option>
                <option value="openai">openai (OpenAI GPT-4.1 / Local Server)</option>
                <option value="deepseek">deepseek (DeepSeek V3 / R1)</option>
                <option value="kimi">kimi (Moonshot Kimi Code)</option>
                <option value="ollama">ollama (Local Ollama Instance)</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Ollama Base URL (`OLLAMA_BASE_URL`)</div>
              <input
                type="text"
                value={ollamaUrl}
                onChange={e => setOllamaUrl(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Parallel Workers (`GRAPHIFY_MAX_WORKERS`)</div>
              <input
                type="number"
                value={graphifyWorkers}
                onChange={e => setGraphifyWorkers(parseInt(e.target.value))}
                style={{ width: '100%', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>API Timeout (`GRAPHIFY_API_TIMEOUT` sec)</div>
              <input
                type="number"
                value={graphifyTimeout}
                onChange={e => setGraphifyTimeout(parseInt(e.target.value))}
                style={{ width: '100%', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
