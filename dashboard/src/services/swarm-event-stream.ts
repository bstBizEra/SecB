/**
 * Live Swarm Event Stream Service (WebSocket / SSE Simulation)
 * Pushes real-time agent activity logs, work package state transitions,
 * and AST node events to the Knowledge Graph Swarm Overlay.
 */

export interface SwarmLogEvent {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  agentIcon: string;
  agentColor: string;
  logLevel: 'INFO' | 'WARN' | 'EXEC' | 'VERIFY' | 'SUCCESS';
  message: string;
  targetNodeId?: string;
}

export type SwarmEventListener = (event: SwarmLogEvent) => void;

class SwarmEventStreamService {
  private listeners: Set<SwarmEventListener> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isStreaming: boolean = false;

  private sampleMessages = [
    { level: 'EXEC', message: 'Parsing AST AST triple graph nodes for AuthorityEngine.ts' },
    { level: 'VERIFY', message: 'Running CVE-1 security boundary check on WorkPackageService' },
    { level: 'INFO', message: 'AgentDB HNSW vector index refreshed (384-dim, 1.15ms latency)' },
    { level: 'SUCCESS', message: 'yFiles Quality Inspector verified 100% Graph Quality Rating' },
    { level: 'EXEC', message: 'Refactoring force-directed canvas math for God Node scaling' },
    { level: 'VERIFY', message: 'Executing 595 unit & integration node test suites' },
    { level: 'INFO', message: '71.5x query token saver active across 1-hop sub-tree context' }
  ];

  private agentsList = [
    { id: 'queen-1', name: 'v3-queen-coord', icon: '👑', color: '#a855f7' },
    { id: 'sec-1', name: 'sec-architect', icon: '🛡️', color: '#ef4444' },
    { id: 'mem-1', name: 'mem-specialist', icon: '🧠', color: '#3b82f6' },
    { id: 'perf-1', name: 'perf-engineer', icon: '⚡', color: '#f59e0b' },
    { id: 'coder-1', name: 'sparc-coder-1', icon: '💻', color: '#10b981' },
    { id: 'test-1', name: 'tester-agent-1', icon: '🧪', color: '#8b5cf6' },
    { id: 'rev-1', name: 'reviewer-agent-1', icon: '🔍', color: '#ec4899' }
  ];

  public subscribe(listener: SwarmEventListener): () => void {
    this.listeners.add(listener);
    if (!this.isStreaming) {
      this.startStream();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopStream();
      }
    };
  }

  public startStream() {
    if (this.isStreaming) return;
    this.isStreaming = true;

    this.intervalId = setInterval(() => {
      if (this.listeners.size === 0) return;

      const randomAg = this.agentsList[Math.floor(Math.random() * this.agentsList.length)];
      const randomMsg = this.sampleMessages[Math.floor(Math.random() * this.sampleMessages.length)];

      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

      const logEv: SwarmLogEvent = {
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: timeStr,
        agentId: randomAg.id,
        agentName: randomAg.name,
        agentIcon: randomAg.icon,
        agentColor: randomAg.color,
        logLevel: randomMsg.level as any,
        message: randomMsg.message
      };

      this.listeners.forEach(fn => fn(logEv));
    }, 2200);
  }

  public stopStream() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isStreaming = false;
  }
}

export const swarmEventStream = new SwarmEventStreamService();
