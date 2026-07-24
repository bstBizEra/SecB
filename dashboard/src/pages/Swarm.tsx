import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Activity, Cpu, Users, Clock, AlertTriangle,
  CheckCircle, Circle, Pause, XCircle, Wifi, WifiOff,
  ChevronRight, GitBranch, BarChart2, Eye
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────
interface WorkflowStep {
  id: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'waiting';
}

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'active' | 'busy' | 'blocked' | 'done';
}

interface TimelineEvent {
  id: string;
  ts: string;
  type: string;
  text: string;
  category: 'runtime' | 'swarm' | 'agent' | 'task' | 'tool' | 'evidence';
}

interface TaskNode {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  children?: TaskNode[];
}

// ── Static Stage-1 data (will be WebSocket-driven in Stage 2) ─────────
const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 'authorize',  label: 'AUTHORIZE',  state: 'done' },
  { id: 'execute',    label: 'EXECUTION',  state: 'active' },
  { id: 'review',     label: 'REV',        state: 'pending' },
  { id: 'qa',         label: 'QA',         state: 'pending' },
  { id: 'governance', label: 'GOV',        state: 'pending' },
];

const AGENTS: Agent[] = [
  { id: 'AGT-RUFLO-PLANNER-001',  name: 'Planner',   type: 'coordinator', status: 'idle' },
  { id: 'AGT-RUFLO-ENGIN-001',    name: 'ENGIN-A',   type: 'coder',       status: 'idle' },
  { id: 'AGT-RUFLO-ENGIN-002',    name: 'ENGIN-B',   type: 'coder',       status: 'idle' },
  { id: 'AGT-RUFLO-REV-001',      name: 'REV',       type: 'reviewer',    status: 'idle' },
  { id: 'AGT-RUFLO-QA-001',       name: 'QA',        type: 'tester',      status: 'idle' },
];

const TASK_TREE: TaskNode = {
  id: 'goal',
  label: 'Goal',
  status: 'pending',
  children: [
    { id: 'contract',     label: 'Contract',       status: 'pending' },
    { id: 'impl',         label: 'Implementation', status: 'pending' },
    { id: 'tests',        label: 'Tests',          status: 'pending' },
    { id: 'review',       label: 'Review',         status: 'pending' },
  ]
};

const EVIDENCE_GATES = [
  { label: 'Write scope',         status: 'pass' },
  { label: 'Unit tests',          status: 'pending' },
  { label: 'Independent REV',     status: 'waiting' },
  { label: 'QA verdict',          status: 'waiting' },
];

// ── Sub-components ────────────────────────────────────────────────────

function WorkflowBar({ steps }: { steps: WorkflowStep[] }) {
  const icons = { done: CheckCircle, active: Activity, pending: Circle, waiting: Clock };
  const colors = {
    done: 'var(--status-done)',
    active: 'var(--accent-light)',
    pending: 'var(--text-muted)',
    waiting: 'var(--status-pending)'
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {steps.map((s, i) => {
        const Icon = icons[s.state];
        return (
          <React.Fragment key={s.id}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: colors[s.state], fontWeight: s.state === 'active' ? 700 : 500 }}>
              <Icon size={13} /> {s.label}
              {s.state === 'active' && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />}
            </span>
            {i < steps.length - 1 && <ChevronRight size={12} color="var(--text-muted)" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AgentDot({ status }: { status: Agent['status'] }) {
  const colors = { idle: 'var(--text-muted)', active: 'var(--status-done)', busy: 'var(--status-pending)', blocked: 'var(--status-blocked)', done: 'var(--status-closed)' };
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: colors[status], flexShrink: 0,
      boxShadow: status === 'busy' ? `0 0 6px ${colors[status]}` : 'none',
      animation: status === 'busy' ? 'pulse 1s infinite' : 'none'
    }} />
  );
}

function TaskTree({ node, depth = 0 }: { node: TaskNode; depth?: number }) {
  const colors = { pending: 'var(--text-muted)', running: 'var(--accent-light)', done: 'var(--status-done)', failed: 'var(--status-blocked)' };
  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: '0.78rem', color: colors[node.status] }}>
        {depth === 0 ? <Shield size={12} /> : <ChevronRight size={10} />}
        {node.label}
      </div>
      {node.children?.map(c => <TaskTree key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

function EvidencePanel({ gates }: { gates: typeof EVIDENCE_GATES }) {
  const map: Record<string, { color: string; label: string }> = {
    pass:    { color: 'var(--status-done)',    label: 'PASS' },
    pending: { color: 'var(--status-pending)', label: 'RUNNING' },
    waiting: { color: 'var(--text-muted)',     label: 'PENDING' },
    fail:    { color: 'var(--status-blocked)', label: 'FAIL' },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gates.map(g => (
        <div key={g.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{g.label}</span>
          <span style={{ color: map[g.status].color, fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
            {map[g.status].label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Swarm page ───────────────────────────────────────────────────
export default function Swarm() {
  const [connected, setConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([
    { id: '1', ts: '00:00', type: 'runtime.connected',  text: 'Ruflo RT-RUFLO-LOCAL-001 registered — Stage 1 read-only', category: 'runtime' },
  ]);

  // Simulated heartbeat (Stage 2 replaces with real WebSocket from port 3001)
  useEffect(() => {
    const iv = setInterval(() => {
      setLastHeartbeat(new Date().toLocaleTimeString());
      setConnected(true);
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const categoryColor: Record<string, string> = {
    runtime: 'var(--accent-light)',
    swarm: 'var(--status-done)',
    agent: 'var(--status-pending)',
    task: 'var(--text-secondary)',
    tool: 'var(--text-muted)',
    evidence: 'var(--status-closed)',
  };

  return (
    <>
      {/* ── Work Package header ── */}
      <div className="card" style={{ background: 'var(--bg-elevated)' }}>
        <div className="card-body" style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>SECB / WP-</span>
                <span>Ruflo Integration P0</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Stage 1 — Read-Only Observation · R0 · M0
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: connected ? 'var(--status-done)' : 'var(--text-muted)' }}>
                {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
                {connected ? `Heartbeat ${lastHeartbeat ?? '—'}` : 'Awaiting runtime'}
              </span>
            </div>
          </div>
          <WorkflowBar steps={WORKFLOW_STEPS} />
        </div>
      </div>

      {/* ── 6-panel Command Center ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gridTemplateRows: 'auto auto auto', gap: 12 }}>

        {/* Panel 1: Agent Fleet */}
        <div className="card">
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <span className="card-title" style={{ fontSize: '0.78rem' }}><Users size={13} /> Ruflo Swarm</span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {AGENTS.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                <AgentDot status={a.status} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{a.type}</div>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Live Event Timeline */}
        <div className="card">
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <span className="card-title" style={{ fontSize: '0.78rem' }}><Activity size={13} /> Live Event Timeline</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Port 3001 · WebSocket</span>
          </div>
          <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120, maxHeight: 180, overflowY: 'auto' }}>
            {events.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: '0.77rem', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.7rem', flexShrink: 0 }}>{e.ts}</span>
                <span style={{ color: categoryColor[e.category], fontFamily: 'var(--font-mono)', fontSize: '0.7rem', flexShrink: 0 }}>{e.type}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{e.text}</span>
              </div>
            ))}
            {events.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Waiting for runtime events on port 3001…</div>}
          </div>
        </div>

        {/* Panel 3: GOAP Task Graph */}
        <div className="card">
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <span className="card-title" style={{ fontSize: '0.78rem' }}><GitBranch size={13} /> GOAP / Task Graph</span>
          </div>
          <div style={{ padding: '10px 14px' }}>
            <TaskTree node={TASK_TREE} />
          </div>
        </div>

        {/* Panel 4: Current Agent Activity */}
        <div className="card">
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <span className="card-title" style={{ fontSize: '0.78rem' }}><Eye size={13} /> Current Agent Activity</span>
          </div>
          <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: 'var(--text-secondary)' }}>No active agent task.</div>
            <div style={{ fontSize: '0.72rem' }}>Stage 1: dispatch not yet wired.</div>
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 6, fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              Policy enforcement ready. Awaiting swarm.started event.
            </div>
          </div>
        </div>

        {/* Panel 5: Evidence & Exit Gates */}
        <div className="card">
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <span className="card-title" style={{ fontSize: '0.78rem' }}><BarChart2 size={13} /> Evidence & Exit Gates</span>
          </div>
          <div style={{ padding: '10px 14px' }}>
            <EvidencePanel gates={EVIDENCE_GATES} />
          </div>
        </div>

        {/* Panel 6: Runtime Health & Controls */}
        <div className="card">
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <span className="card-title" style={{ fontSize: '0.78rem' }}><Cpu size={13} /> Runtime Health & Controls</span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>RT-RUFLO-LOCAL-001</span>
                <span style={{ color: connected ? 'var(--status-done)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {connected ? 'Healthy' : 'Awaiting'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Last heartbeat</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {lastHeartbeat ?? '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Stage</span>
                <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>1 — Read-Only</span>
              </div>
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: 'Pause',      icon: Pause,      disabled: true  },
                { label: 'Steer',      icon: Activity,   disabled: true  },
                { label: 'Cancel',     icon: XCircle,    disabled: true  },
                { label: 'Quarantine', icon: AlertTriangle, disabled: true },
              ].map(({ label, icon: Icon, disabled }) => (
                <button key={label} className="btn btn-ghost" disabled={disabled}
                  style={{ fontSize: '0.72rem', padding: '4px 10px', gap: 4, opacity: disabled ? 0.4 : 1 }}>
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Controls active at Stage 2 (Governed Dispatch)
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
