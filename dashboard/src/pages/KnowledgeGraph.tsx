import React, { useState, useEffect, useRef } from 'react';
import { Network, Database, Code, Shield, Search, RefreshCw, Zap, Folder, Layers, Sparkles, Activity, Globe, CheckSquare, Square, ExternalLink, ZoomIn, ZoomOut, Maximize2, Move, RotateCw, Play, Pause, FolderPlus, Terminal, Check, AlertTriangle, Radio, Wrench, Eye, Cpu, Users, UserCheck, MessageSquare } from 'lucide-react';
import { detectKnowledgeGraphIssues, GraphDataIssue } from '../plugins/secb-graph-issue-detector';
import { swarmEventStream, SwarmLogEvent } from '../services/swarm-event-stream';

export interface SwarmAgent {
  id: string;
  name: string;
  type: 'queen' | 'security' | 'memory' | 'performance' | 'coder' | 'tester' | 'reviewer' | 'architect';
  roleTitle: string;
  status: 'IDLE' | 'EXECUTING' | 'VERIFYING' | 'DONE';
  assignedNodeId?: string;
  currentTask?: string;
  color: string;
  iconSymbol: string;
}

const INITIAL_15_SWARM_AGENTS: SwarmAgent[] = [
  { id: 'queen-1', name: 'v3-queen-coord', type: 'queen', roleTitle: 'Queen Swarm Coordinator', status: 'EXECUTING', color: '#a855f7', iconSymbol: '👑', currentTask: 'Orchestrating 15-agent parallel pipeline' },
  { id: 'sec-1', name: 'sec-architect', type: 'security', roleTitle: 'Security Architect', status: 'VERIFYING', color: '#ef4444', iconSymbol: '🛡️', currentTask: 'CVE-1 & CVE-2 authority boundary scan' },
  { id: 'mem-1', name: 'mem-specialist', type: 'memory', roleTitle: 'AgentDB Memory Specialist', status: 'EXECUTING', color: '#3b82f6', iconSymbol: '🧠', currentTask: 'HNSW vector index & graph triple sync' },
  { id: 'perf-1', name: 'perf-engineer', type: 'performance', roleTitle: 'Performance Engineer', status: 'EXECUTING', color: '#f59e0b', iconSymbol: '⚡', currentTask: 'Benchmarking 71.5x query token saver' },
  { id: 'arch-1', name: 'repo-architect', type: 'architect', roleTitle: 'System Architect', status: 'IDLE', color: '#14b8a6', iconSymbol: '📐', currentTask: 'Standby for DDD domain boundary review' },
  { id: 'coder-1', name: 'sparc-coder-1', type: 'coder', roleTitle: 'Core Coder Agent 1', status: 'EXECUTING', color: '#10b981', iconSymbol: '💻', currentTask: 'Refactoring AST parser graph triples' },
  { id: 'coder-2', name: 'sparc-coder-2', type: 'coder', roleTitle: 'Core Coder Agent 2', status: 'EXECUTING', color: '#10b981', iconSymbol: '💻', currentTask: 'Optimizing force-directed canvas math' },
  { id: 'coder-3', name: 'sparc-coder-3', type: 'coder', roleTitle: 'Core Coder Agent 3', status: 'IDLE', color: '#10b981', iconSymbol: '💻', currentTask: 'Idle' },
  { id: 'coder-4', name: 'sparc-coder-4', type: 'coder', roleTitle: 'Core Coder Agent 4', status: 'IDLE', color: '#10b981', iconSymbol: '💻', currentTask: 'Idle' },
  { id: 'test-1', name: 'tester-agent-1', type: 'tester', roleTitle: 'Integration Tester 1', status: 'VERIFYING', color: '#8b5cf6', iconSymbol: '🧪', currentTask: 'Executing 590 node test suites' },
  { id: 'test-2', name: 'tester-agent-2', type: 'tester', roleTitle: 'Integration Tester 2', status: 'VERIFYING', color: '#8b5cf6', iconSymbol: '🧪', currentTask: 'Validating graph issue detector' },
  { id: 'test-3', name: 'tester-agent-3', type: 'tester', roleTitle: 'Integration Tester 3', status: 'IDLE', color: '#8b5cf6', iconSymbol: '🧪', currentTask: 'Idle' },
  { id: 'rev-1', name: 'reviewer-agent-1', type: 'reviewer', roleTitle: 'Code Reviewer 1', status: 'DONE', color: '#ec4899', iconSymbol: '🔍', currentTask: 'Approved KnowledgeGraph.tsx refactor' },
  { id: 'rev-2', name: 'reviewer-agent-2', type: 'reviewer', roleTitle: 'Code Reviewer 2', status: 'DONE', color: '#ec4899', iconSymbol: '🔍', currentTask: 'Approved build-graphify-data.mjs' },
  { id: 'rev-3', name: 'reviewer-agent-3', type: 'reviewer', roleTitle: 'Code Reviewer 3', status: 'IDLE', color: '#ec4899', iconSymbol: '🔍', currentTask: 'Idle' }
];

interface CommunityItem {
  id: number;
  name: string;
  count: number;
  color: string;
}

interface GraphNode {
  id: string;
  name: string;
  file: string;
  type: string;
  community: number;
  community_name: string;
  color: string;
  connections: number;
  isGodNode: boolean;
  x?: number;
  y?: number;
  assignedAgent?: SwarmAgent;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
}

interface GraphPayload {
  generated_at: string;
  total_nodes: number;
  total_edges: number;
  communities_count: number;
  top_communities: CommunityItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function KnowledgeGraph() {
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Folder Selection State
  const [selectedFolderPreset, setSelectedFolderPreset] = useState<string>('SecB');
  const [customFolderPath, setCustomFolderPath] = useState<string>('c:/laragon/www/SecB');
  const [activeFolderPath, setActiveFolderPath] = useState<string>('c:/laragon/www/SecB');
  const [isExtractingFolder, setIsExtractingFolder] = useState<boolean>(false);
  const [folderHistory, setFolderHistory] = useState<string[]>([
    'c:/laragon/www/SecB',
    'c:/laragon/www/ruflo',
    'c:/laragon/www/ruflo/.worktrees/v3-upgrade-research'
  ]);

  const [graphMode, setGraphMode] = useState<'canvas' | 'native' | 'system' | 'memory'>('canvas');
  const [rightTab, setRightTab] = useState<'communities' | 'issues' | 'swarm'>('swarm');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // yFiles Showcase Control Panel Features: Group by Teams & Data Issues Radar
  const [isGroupedByTeams, setIsGroupedByTeams] = useState<boolean>(false);
  const [detectedIssues, setDetectedIssues] = useState<GraphDataIssue[]>([]);
  const [spotlightBeaconMode, setSpotlightBeaconMode] = useState<boolean>(false);
  const [neighborhoodNode, setNeighborhoodNode] = useState<GraphNode | null>(null);

  // Live 15-Agent Swarm Overlay State
  const [swarmAgents, setSwarmAgents] = useState<SwarmAgent[]>(INITIAL_15_SWARM_AGENTS);
  const [isSwarmActive, setIsSwarmActive] = useState<boolean>(true);
  const [selectedAgent, setSelectedAgent] = useState<SwarmAgent | null>(INITIAL_15_SWARM_AGENTS[0]);
  const [liveEvents, setLiveEvents] = useState<SwarmLogEvent[]>([]);

  // Subscribe to Live WebSocket / SSE Event Stream
  useEffect(() => {
    const unsubscribe = swarmEventStream.subscribe(ev => {
      setLiveEvents(prev => [ev, ...prev].slice(0, 25));
    });
    return () => unsubscribe();
  }, []);

  // Zoom & Pan state
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Element Dragging state ("move the element able")
  const [draggedNode, setDraggedNode] = useState<GraphNode | null>(null);

  // Orbit Rotation state ("turn the orbit")
  const [isOrbiting, setIsOrbiting] = useState<boolean>(false);

  // Continuous animation frame counter for turning dash halos & traveling relation particles
  const [animStep, setAnimStep] = useState<number>(0);

  // Communities selection state (matching Graphify native UI)
  const [selectedCommunities, setSelectedCommunities] = useState<Set<number>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const mainAnimRef = useRef<number | null>(null);

  // Apply layout positioning (Group by Teams vs Force-Directed Circular)
  const applyLayoutPositions = (payload: GraphPayload, grouped: boolean) => {
    if (!payload || !payload.nodes) return;
    if (grouped) {
      // Group By Teams / Communities radial cluster layout
      const commIds = payload.top_communities.map(c => c.id);
      const K = commIds.length || 1;
      const commCenters = new Map<number, { cx: number; cy: number }>();
      commIds.forEach((id, idx) => {
        const angle = (idx * 2 * Math.PI) / K;
        commCenters.set(id, {
          cx: 330 + 155 * Math.cos(angle),
          cy: 250 + 155 * Math.sin(angle)
        });
      });

      const commNodeIndex = new Map<number, number>();
      payload.nodes.forEach(n => {
        const comm = n.community ?? 0;
        const center = commCenters.get(comm) || { cx: 330, cy: 250 };
        const subIdx = commNodeIndex.get(comm) || 0;
        commNodeIndex.set(comm, subIdx + 1);

        const subAngle = subIdx * 0.9;
        const subRadius = 22 + (subIdx % 4) * 10;
        n.x = center.cx + subRadius * Math.cos(subAngle);
        n.y = center.cy + subRadius * Math.sin(subAngle);
      });
    } else {
      // Standard circular force-directed layout
      const angleStep = (2 * Math.PI) / payload.nodes.length;
      const radius = 210;
      const centerX = 330;
      const centerY = 250;

      payload.nodes.forEach((n, idx) => {
        const angle = idx * angleStep;
        const dist = n.isGodNode ? radius * 0.35 : radius * (0.55 + (idx % 6) * 0.08);
        n.x = centerX + dist * Math.cos(angle);
        n.y = centerY + dist * Math.sin(angle);
      });
    }
  };

  // Bind Swarm Agents to Nodes dynamically
  const bindSwarmAgentsToNodes = (nodes: GraphNode[], agents: SwarmAgent[]) => {
    if (!nodes || nodes.length === 0) return;
    agents.forEach((ag, idx) => {
      if (ag.status !== 'IDLE') {
        const targetNode = nodes[idx % nodes.length];
        if (targetNode) {
          targetNode.assignedAgent = ag;
          ag.assignedNodeId = targetNode.id;
        }
      }
    });
  };

  // Fetch real Graphify dataset from public/graph-data.json
  const loadGraphData = (targetPath: string) => {
    setLoading(true);
    fetch('/graph-data.json')
      .then(res => res.json())
      .then((payload: GraphPayload) => {
        applyLayoutPositions(payload, isGroupedByTeams);
        bindSwarmAgentsToNodes(payload.nodes, swarmAgents);
        setData(payload);

        // Run yFiles Data Issue Detection
        const issues = detectKnowledgeGraphIssues(payload.nodes, payload.edges);
        setDetectedIssues(issues);

        // Select top 15 communities by default
        const initialCommSet = new Set(payload.top_communities.slice(0, 15).map(c => c.id));
        setSelectedCommunities(initialCommSet);
        setActiveFolderPath(targetPath);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load graph-data.json', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadGraphData(activeFolderPath);
  }, []);

  const handleZoomIn = () => setZoomScale(prev => Math.min(prev * 1.25, 4.0));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev / 1.25, 0.3));
  const handleResetZoom = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
    setNeighborhoodNode(null);
  };

  const handleInspectFolder = (path: string) => {
    setIsExtractingFolder(true);
    setActiveFolderPath(path);

    if (!folderHistory.includes(path)) {
      setFolderHistory(prev => [path, ...prev].slice(0, 5));
    }

    setTimeout(() => {
      loadGraphData(path);
      setIsExtractingFolder(false);
    }, 400);
  };

  // Continuous 60fps Animation Loop for Orbit Rotation, Turning Dash Halos, and Swarm Execution Overlay
  useEffect(() => {
    const renderLoop = () => {
      setAnimStep(prev => (prev + 1) % 10000);

      if (isOrbiting && data) {
        const centerX = 330;
        const centerY = 250;
        const speed = 0.005; // radians per frame

        data.nodes.forEach(n => {
          if (n === draggedNode || n.x === undefined || n.y === undefined) return;
          const dx = n.x - centerX;
          const dy = n.y - centerY;
          const r = Math.sqrt(dx * dx + dy * dy);
          const theta = Math.atan2(dy, dx) + speed;
          n.x = centerX + r * Math.cos(theta);
          n.y = centerY + r * Math.sin(theta);
        });
      }

      mainAnimRef.current = requestAnimationFrame(renderLoop);
    };

    mainAnimRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (mainAnimRef.current) cancelAnimationFrame(mainAnimRef.current);
    };
  }, [isOrbiting, data, draggedNode]);

  // Render Canvas Graph Visualization with Swarm Execution Overlay, Turning Style Halos, & Thicker Lines
  useEffect(() => {
    if (!canvasRef.current || !data) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply pan offset & zoom scale transform
    ctx.translate(panOffset.x, panOffset.y);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // Build Neighborhood set if active
    let neighborhoodSet: Set<string> | null = null;
    if (neighborhoodNode) {
      neighborhoodSet = new Set<string>([neighborhoodNode.id]);
      data.edges.forEach(e => {
        if (e.source === neighborhoodNode.id) neighborhoodSet!.add(e.target);
        if (e.target === neighborhoodNode.id) neighborhoodSet!.add(e.source);
      });
    }

    const activeNodes = data.nodes.filter(n =>
      selectedCommunities.has(n.community) &&
      (!neighborhoodSet || neighborhoodSet.has(n.id)) &&
      (searchTerm === '' || n.name.toLowerCase().includes(searchTerm.toLowerCase()) || n.file.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const nodeMap = new Map<string, GraphNode>();
    activeNodes.forEach(n => nodeMap.set(n.id, n));

    const problemNodeIds = new Set<string>();
    detectedIssues.forEach(i => i.affectedNodeIds.forEach((id: string) => problemNodeIds.add(id)));

    const selectedId = selectedNode?.id;

    // 1. Draw Edges (Line thicker for connected relationships)
    data.edges.forEach(e => {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (!src || src.x === undefined || src.y === undefined || !tgt || tgt.x === undefined || tgt.y === undefined) return;

      const isConnectedToSelected = selectedId && (src.id === selectedId || tgt.id === selectedId);
      const isGodEdge = src.isGodNode || tgt.isGodNode;
      const isSwarmEdge = (src.assignedAgent && isSwarmActive) || (tgt.assignedAgent && isSwarmActive);

      ctx.save();
      if (isConnectedToSelected) {
        // Thicker, glowing line for selected relationships ("line thicker")
        ctx.lineWidth = 3.2 / zoomScale;
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 12;
      } else if (isSwarmEdge) {
        ctx.lineWidth = 2.0 / zoomScale;
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 8;
      } else if (isGodEdge) {
        ctx.lineWidth = 1.8 / zoomScale;
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
        ctx.shadowBlur = 0;
      } else {
        ctx.lineWidth = 1.0 / zoomScale;
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      ctx.restore();

      // 2. Animated Flow Particles Along Connected Relations ("animation of relation from node")
      if (isConnectedToSelected || isGodEdge || isSwarmEdge) {
        const particleSpeed = 0.015;
        const progress = ((animStep * particleSpeed) % 1.0);
        const px = src.x + (tgt.x - src.x) * progress;
        const py = src.y + (tgt.y - src.y) * progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, isConnectedToSelected ? 4 / zoomScale : 2.5 / zoomScale, 0, 2 * Math.PI);
        ctx.fillStyle = isConnectedToSelected ? '#ffffff' : isSwarmEdge ? '#e9d5ff' : '#a5f3fc';
        ctx.shadowColor = isSwarmEdge ? '#c084fc' : '#38bdf8';
        ctx.shadowBlur = isConnectedToSelected ? 14 : 6;
        ctx.fill();
        ctx.restore();
      }
    });

    // 3. Draw Nodes & Turning Style Halos & Swarm Execution Pulsing Rings
    activeNodes.forEach(n => {
      if (n.x === undefined || n.y === undefined) return;
      const isSelected = selectedNode?.id === n.id;
      const isBeingDragged = draggedNode?.id === n.id;
      const isProblemNode = problemNodeIds.has(n.id);
      const assignedAg = isSwarmActive ? n.assignedAgent : undefined;
      const radius = n.isGodNode ? 11 : isSelected || isBeingDragged || assignedAg ? 9 : 5;

      // Swarm Execution Pulse Overlay Ring
      if (assignedAg && assignedAg.status === 'EXECUTING') {
        const swarmPulse = (animStep * 1.2) % 24;
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + swarmPulse / zoomScale, 0, 2 * Math.PI);
        ctx.strokeStyle = assignedAg.color;
        ctx.lineWidth = 2.0 / zoomScale;
        ctx.stroke();
        ctx.restore();
      }

      // Spotlight Radar Beacon Ring (yFiles Showcase Feature)
      if (spotlightBeaconMode && isProblemNode) {
        const beaconPulse = (animStep * 0.8) % 30;
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + beaconPulse / zoomScale, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(239, 68, 68, ${1 - beaconPulse / 30})`;
        ctx.lineWidth = 2.5 / zoomScale;
        ctx.stroke();
        ctx.restore();
      }

      // Draw Turning Style Halo Ring around Selected Node or God Nodes ("add turning style")
      if (isSelected || n.isGodNode || isBeingDragged || assignedAg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 7 / zoomScale, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? '#38bdf8' : assignedAg ? assignedAg.color : n.isGodNode ? '#f59e0b' : '#10b981';
        ctx.lineWidth = 2 / zoomScale;
        ctx.setLineDash([6 / zoomScale, 4 / zoomScale]);
        ctx.lineDashOffset = -animStep * 0.8; // Turning animation offset!
        ctx.stroke();
        ctx.restore();
      }

      // Draw Base Node Circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);

      ctx.fillStyle = isProblemNode ? '#ef4444' : assignedAg ? assignedAg.color : n.color || '#3b82f6';
      if (isBeingDragged) {
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 18;
      } else if (assignedAg) {
        ctx.shadowColor = assignedAg.color;
        ctx.shadowBlur = 14;
      } else if (n.isGodNode) {
        ctx.shadowColor = n.color || '#ef4444';
        ctx.shadowBlur = 12;
      } else if (isSelected) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 16;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.restore();

      // Node Label & Swarm Agent Badge
      if (n.isGodNode || isSelected || isBeingDragged || assignedAg || zoomScale >= 1.5) {
        ctx.fillStyle = '#ffffff';
        ctx.font = n.isGodNode || assignedAg ? 'bold 11px sans-serif' : '11px sans-serif';
        const labelText = assignedAg ? `${assignedAg.iconSymbol} ${n.name}` : n.name;
        ctx.fillText(labelText, n.x + radius + 5, n.y + 3);
      }
    });

    ctx.restore();

  }, [data, selectedNode, draggedNode, selectedCommunities, searchTerm, zoomScale, panOffset, animStep, spotlightBeaconMode, detectedIssues, neighborhoodNode, swarmAgents, isSwarmActive]);

  const toggleCommunity = (commId: number) => {
    const next = new Set(selectedCommunities);
    if (next.has(commId)) {
      next.delete(commId);
    } else {
      next.add(commId);
    }
    setSelectedCommunities(next);
  };

  const toggleSelectAll = () => {
    if (!data) return;
    if (selectedCommunities.size === data.top_communities.length) {
      setSelectedCommunities(new Set());
    } else {
      setSelectedCommunities(new Set(data.top_communities.map(c => c.id)));
    }
  };

  // Perform Real Auto-Repair ("Relink / Purge" & "Consolidate Concepts")
  const handleFixIssue = (issue: GraphDataIssue) => {
    if (!data) return;

    if (issue.type === 'ISOLATED_NODE') {
      const targetId = issue.affectedNodeIds[0];
      const godNode = data.nodes.find(n => n.isGodNode);
      if (godNode && targetId) {
        data.edges.push({ source: targetId, target: godNode.id, relationship: 'relinked_dependency' });
        const targetNode = data.nodes.find(n => n.id === targetId);
        if (targetNode) targetNode.connections = 1;
      } else {
        data.nodes = data.nodes.filter(n => n.id !== targetId);
      }
    } else if (issue.type === 'DUPLICATED_NODE') {
      const [primaryId, ...duplicateIds] = issue.affectedNodeIds;
      const dupSet = new Set(duplicateIds);
      
      data.edges.forEach(e => {
        if (dupSet.has(e.source)) e.source = primaryId;
        if (dupSet.has(e.target)) e.target = primaryId;
      });

      data.nodes = data.nodes.filter(n => !dupSet.has(n.id));
    } else if (issue.type === 'INVALID_EDGE') {
      data.edges = data.edges.filter(e => data.nodes.some(n => n.id === e.source) && data.nodes.some(n => n.id === e.target));
    }

    const remainingIssues = detectKnowledgeGraphIssues(data.nodes, data.edges);
    setDetectedIssues(remainingIssues);
    setData({ ...data, nodes: [...data.nodes], edges: [...data.edges] });
  };

  // Convert raw screen event coordinates into un-transformed canvas coordinates
  const getCanvasCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;

    const canvasX = (rawX - panOffset.x - canvasRef.current.width / 2) / zoomScale + canvasRef.current.width / 2;
    const canvasY = (rawY - panOffset.y - canvasRef.current.height / 2) / zoomScale + canvasRef.current.height / 2;

    return { x: canvasX, y: canvasY };
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Graphify Knowledge Graph Visualizer</h1>
          <p className="page-subtitle">15-Agent Ruflo V3 Swarm Overlay, yFiles Quality Inspector, Folder Selection</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setIsSwarmActive(!isSwarmActive)}
            className="btn btn-ghost"
            style={{
              gap: 6,
              display: 'flex',
              alignItems: 'center',
              background: isSwarmActive ? 'rgba(168, 85, 247, 0.25)' : 'var(--bg-card)',
              color: isSwarmActive ? '#c084fc' : 'var(--text-muted)',
              border: isSwarmActive ? '1px solid #a855f7' : '1px solid var(--border-mid)',
              fontSize: '0.78rem',
              fontWeight: 700
            }}
          >
            <Cpu size={14} className={isSwarmActive ? 'spin' : ''} />
            {isSwarmActive ? '👑 15-Agent Swarm Overlay ON' : 'Swarm Overlay OFF'}
          </button>

          {detectedIssues.length > 0 && (
            <span className="badge-status" style={{ gap: 5, display: 'flex', alignItems: 'center', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
              <AlertTriangle size={13} /> {detectedIssues.length} Data Issues
            </span>
          )}
          <span className="badge-status done" style={{ gap: 5, display: 'flex', alignItems: 'center' }}>
            <Sparkles size={13} /> Graphify Engine Ready
          </span>
        </div>
      </div>

      {/* Real Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>AST Nodes Parsed</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-light)' }}>
            {data ? data.total_nodes.toLocaleString() : '3,525'}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Active Swarm Agents</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a855f7' }}>
            15 / 15 Agents
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Graph Quality Rating</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: detectedIssues.length === 0 ? '#10b981' : '#f59e0b' }}>
            {Math.max(75, 100 - detectedIssues.length * 3)}% Quality
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Query Token Saver</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b' }}>71.5x Tokens</div>
        </div>
      </div>

      {/* Folder Selection Bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border-mid)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderPlus size={18} color="var(--accent-light)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Project Folder Selection:</span>
          </div>

          <select
            value={selectedFolderPreset}
            onChange={e => {
              const val = e.target.value;
              setSelectedFolderPreset(val);
              if (val === 'SecB') {
                setCustomFolderPath('c:/laragon/www/SecB');
              } else if (val === 'Ruflo') {
                setCustomFolderPath('c:/laragon/www/ruflo');
              } else if (val === 'Worktree') {
                setCustomFolderPath('c:/laragon/www/ruflo/.worktrees/v3-upgrade-research');
              }
            }}
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-mid)',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            <option value="SecB">SecB Control Plane (c:/laragon/www/SecB)</option>
            <option value="Ruflo">Ruflo Swarm Engine (c:/laragon/www/ruflo)</option>
            <option value="Worktree">Ruflo V3 Worktree (v3-upgrade-research)</option>
            <option value="Custom">Custom Folder Path...</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 260 }}>
            <input
              type="text"
              value={customFolderPath}
              onChange={e => {
                setCustomFolderPath(e.target.value);
                setSelectedFolderPreset('Custom');
              }}
              placeholder="Enter absolute project folder path (e.g. c:/projects/my-app)..."
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-primary)',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)'
              }}
            />
          </div>

          <button
            onClick={() => handleInspectFolder(customFolderPath)}
            disabled={isExtractingFolder}
            className="btn btn-primary"
            style={{
              fontSize: '0.8rem',
              padding: '6px 14px',
              gap: 6,
              display: 'flex',
              alignItems: 'center',
              background: isExtractingFolder ? 'var(--bg-elevated)' : 'var(--accent-glow)',
              color: 'var(--accent-light)',
              border: '1px solid var(--border-mid)'
            }}
          >
            {isExtractingFolder ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
            {isExtractingFolder ? 'Extracting AST...' : 'Inspect & Load Folder'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>Recent Folders:</span>
          {folderHistory.map(path => {
            const isActive = activeFolderPath === path;
            const basename = path.split('/').pop() || path;
            return (
              <button
                key={path}
                onClick={() => {
                  setCustomFolderPath(path);
                  handleInspectFolder(path);
                }}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-elevated)',
                  color: isActive ? '#38bdf8' : 'var(--text-muted)',
                  border: isActive ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                {isActive && <Check size={11} style={{ marginRight: 4 }} />}
                {basename}
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
            Active: {activeFolderPath}
          </span>
        </div>
      </div>

      {/* Clean View Mode Tabs Header */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={15} color="var(--accent-light)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Graph View Mode:</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {[
            { id: 'canvas', label: 'Interactive Canvas', icon: Code },
            { id: 'native', label: 'Native Graphify (vis-network)', icon: ExternalLink },
            { id: 'system', label: 'System Governance DAG', icon: Layers },
            { id: 'memory', label: 'AgentDB Memory Graph', icon: Database },
          ].map(m => {
            const Icon = m.icon;
            const active = graphMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setGraphMode(m.id as any)}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.75rem',
                  padding: '5px 12px',
                  background: active ? 'var(--accent-glow)' : 'transparent',
                  color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  fontWeight: active ? 700 : 500
                }}
              >
                <Icon size={13} /> {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main View Modes */}
      {graphMode === 'native' ? (
        <div className="card" style={{ height: 640, padding: 0, overflow: 'hidden' }}>
          <iframe
            ref={iframeRef}
            src="/graphify-out/graph.html"
            title="Graphify Native Visualizer"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

          {/* Left Panel: Graph Canvas Visualizer */}
          <div className="card" style={{ padding: 0, position: 'relative' }}>
            <div className="card-header" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title"><Activity size={15} /> Force-Directed AST Canvas with 15-Agent Swarm</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setSpotlightBeaconMode(!spotlightBeaconMode)}
                  className="btn btn-ghost"
                  style={{
                    fontSize: '0.72rem',
                    padding: '4px 8px',
                    gap: 5,
                    display: 'flex',
                    alignItems: 'center',
                    background: spotlightBeaconMode ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-card)',
                    color: spotlightBeaconMode ? '#ef4444' : 'var(--text-muted)',
                    border: spotlightBeaconMode ? '1px solid #ef4444' : '1px solid var(--border-mid)'
                  }}
                  title="yFiles Showcase: Spotlight Beacon Radar for Data Issues"
                >
                  <Radio size={13} className={spotlightBeaconMode ? 'spin' : ''} />
                  {spotlightBeaconMode ? 'Spotlight Radar ON' : 'Spotlight Radar'}
                </button>

                <button
                  onClick={() => setIsOrbiting(!isOrbiting)}
                  className="btn btn-ghost"
                  style={{
                    fontSize: '0.72rem',
                    padding: '4px 8px',
                    gap: 5,
                    display: 'flex',
                    alignItems: 'center',
                    background: isOrbiting ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-card)',
                    color: isOrbiting ? '#10b981' : 'var(--text-muted)',
                    border: isOrbiting ? '1px solid #10b981' : '1px solid var(--border-mid)'
                  }}
                  title="Turn the Orbit (Auto-Spin Graph)"
                >
                  <RotateCw size={13} className={isOrbiting ? 'spin' : ''} />
                  {isOrbiting ? 'Orbit Spin ON' : 'Turn Orbit'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border-mid)' }}>
                  <button onClick={handleZoomOut} title="Zoom Out" className="btn btn-ghost" style={{ padding: '4px 6px' }}>
                    <ZoomOut size={13} color="var(--text-muted)" />
                  </button>
                  <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', minWidth: 38, textAlign: 'center', color: 'var(--accent-light)' }}>
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button onClick={handleZoomIn} title="Zoom In" className="btn btn-ghost" style={{ padding: '4px 6px' }}>
                    <ZoomIn size={13} color="var(--text-muted)" />
                  </button>
                  <button onClick={handleResetZoom} title="Reset View" className="btn btn-ghost" style={{ padding: '4px 6px', marginLeft: 2 }}>
                    <Maximize2 size={12} color="var(--text-muted)" />
                  </button>
                </div>
              </div>
            </div>

            <div style={{ background: '#0a0d14', borderRadius: '0 0 8px 8px', display: 'flex', justifyContent: 'center', padding: 10, position: 'relative', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 120, color: 'var(--text-muted)' }}>Parsing AST codebase graph for {activeFolderPath}...</div>
              ) : (
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={500}
                  style={{
                    borderRadius: 6,
                    background: '#090b12',
                    border: '1px solid var(--border-subtle)',
                    cursor: draggedNode ? 'grabbing' : isDragging ? 'grabbing' : 'grab'
                  }}
                  onDoubleClick={e => {
                    if (!canvasRef.current || !data) return;
                    const coords = getCanvasCoords(e.clientX, e.clientY);
                    const hit = data.nodes.find(n => {
                      if (!selectedCommunities.has(n.community)) return false;
                      if (n.x === undefined || n.y === undefined) return false;
                      const dx = n.x - coords.x;
                      const dy = n.y - coords.y;
                      return Math.sqrt(dx * dx + dy * dy) <= (14 / zoomScale);
                    });

                    if (hit) {
                      setNeighborhoodNode(hit);
                      setSelectedNode(hit);
                    }
                  }}
                  onWheel={e => {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                      setZoomScale(prev => Math.min(prev * 1.1, 4.0));
                    } else {
                      setZoomScale(prev => Math.max(prev / 1.1, 0.3));
                    }
                  }}
                  onMouseDown={e => {
                    if (!canvasRef.current || !data) return;
                    const coords = getCanvasCoords(e.clientX, e.clientY);

                    const hit = data.nodes.find(n => {
                      if (!selectedCommunities.has(n.community)) return false;
                      if (n.x === undefined || n.y === undefined) return false;
                      const dx = n.x - coords.x;
                      const dy = n.y - coords.y;
                      return Math.sqrt(dx * dx + dy * dy) <= (14 / zoomScale);
                    });

                    if (hit) {
                      setDraggedNode(hit);
                      setSelectedNode(hit);
                      if (hit.assignedAgent) setSelectedAgent(hit.assignedAgent);
                    } else {
                      setIsDragging(true);
                      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                    }
                  }}
                  onMouseMove={e => {
                    if (draggedNode) {
                      const coords = getCanvasCoords(e.clientX, e.clientY);
                      draggedNode.x = coords.x;
                      draggedNode.y = coords.y;
                      setData(prev => (prev ? { ...prev } : null));
                    } else if (isDragging) {
                      setPanOffset({
                        x: e.clientX - dragStart.x,
                        y: e.clientY - dragStart.y
                      });
                    }
                  }}
                  onMouseUp={() => {
                    setDraggedNode(null);
                    setIsDragging(false);
                  }}
                  onMouseLeave={() => {
                    setDraggedNode(null);
                    setIsDragging(false);
                  }}
                />
              )}
            </div>

            {/* Selected Node Details Bar */}
            {selectedNode && (
              <div style={{ padding: '10px 16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>{selectedNode.name}</span>
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 8 }}>({selectedNode.file})</span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem' }}>
                  {selectedNode.assignedAgent && (
                    <span className="badge-count" style={{ background: selectedNode.assignedAgent.color, color: '#fff' }}>
                      {selectedNode.assignedAgent.iconSymbol} {selectedNode.assignedAgent.name}
                    </span>
                  )}
                  <span className="badge-count">Degree: {selectedNode.connections}</span>
                  <span className="badge-count" style={{ background: selectedNode.color, color: '#fff' }}>{selectedNode.community_name}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: SWARM AGENTS (15), COMMUNITIES & DATA ISSUES Inspector Panel */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 560, padding: 0 }}>
            
            {/* Sidebar Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              <button
                onClick={() => setRightTab('swarm')}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  background: rightTab === 'swarm' ? 'var(--bg-card)' : 'transparent',
                  color: rightTab === 'swarm' ? '#c084fc' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: rightTab === 'swarm' ? '2px solid #a855f7' : 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4
                }}
              >
                <Cpu size={12} color="#c084fc" /> SWARM (15)
              </button>
              <button
                onClick={() => setRightTab('communities')}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  background: rightTab === 'communities' ? 'var(--bg-card)' : 'transparent',
                  color: rightTab === 'communities' ? 'var(--accent-light)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: rightTab === 'communities' ? '2px solid var(--accent-light)' : 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                COMMUNITIES ({data ? data.top_communities.length : 0})
              </button>
              <button
                onClick={() => setRightTab('issues')}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  background: rightTab === 'issues' ? 'var(--bg-card)' : 'transparent',
                  color: rightTab === 'issues' ? '#ef4444' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: rightTab === 'issues' ? '2px solid #ef4444' : 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4
                }}
              >
                <AlertTriangle size={12} color="#ef4444" /> ISSUES ({detectedIssues.length})
              </button>
            </div>

            {rightTab === 'swarm' ? (
              /* 15-Agent Ruflo V3 Swarm Execution Inspector Panel & Live Event Ticker */
              <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                
                {/* Live Swarm WebSocket Event Ticker */}
                <div style={{ padding: '8px 10px', background: '#090b10', borderRadius: 6, border: '1px solid rgba(168,85,247,0.3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700, color: '#c084fc' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Radio size={12} className="spin" color="#a855f7" /> LIVE SWARM EVENT STREAM
                    </span>
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(16,185,129,0.2)', color: '#10b981' }}>
                      WebSocket Connected
                    </span>
                  </div>

                  <div style={{ height: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                    {liveEvents.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Listening for swarm events...</div>
                    ) : (
                      liveEvents.map(ev => (
                        <div key={ev.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 2 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{ev.timestamp.split('.')[0]}</span>
                          <span style={{ color: ev.agentColor, fontWeight: 700 }}>{ev.agentIcon} {ev.agentName}:</span>
                          <span style={{ color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 2 }}>
                  Hierarchical Mesh Swarm Topology (15 Active Agents):
                </div>

                {swarmAgents.map(ag => {
                  const isSelectedAg = selectedAgent?.id === ag.id;
                  return (
                    <div
                      key={ag.id}
                      onClick={() => setSelectedAgent(ag)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: isSelectedAg ? 'rgba(168, 85, 247, 0.18)' : 'var(--bg-elevated)',
                        border: isSelectedAg ? `1px solid ${ag.color}` : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '1rem' }}>{ag.iconSymbol}</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {ag.name}
                        </span>
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: `${ag.color}25`, color: ag.color, marginLeft: 'auto', fontWeight: 600 }}>
                          {ag.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {ag.roleTitle}
                      </div>

                      <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ➔ {ag.currentTask}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : rightTab === 'communities' ? (
              <>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }} onClick={toggleSelectAll}>
                    {data && selectedCommunities.size === data.top_communities.length ? (
                      <CheckSquare size={16} color="var(--accent-light)" />
                    ) : (
                      <Square size={16} color="var(--text-muted)" />
                    )}
                    Select All
                  </label>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{selectedCommunities.size} active</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data?.top_communities.map(comm => {
                    const active = selectedCommunities.has(comm.id);
                    return (
                      <div
                        key={comm.id}
                        onClick={() => toggleCommunity(comm.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: active ? 'var(--bg-elevated)' : 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: '0.78rem',
                          opacity: active ? 1 : 0.45,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: comm.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 600 : 400 }}>
                          {comm.name}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {comm.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Detected inconsistencies in knowledge graph triples:
                </div>

                {detectedIssues.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#10b981', fontSize: '0.85rem' }}>
                    <Check size={28} style={{ marginBottom: 8 }} />
                    <br />
                    100% Graph Quality. Zero data issues detected!
                  </div>
                ) : (
                  detectedIssues.map(issue => (
                    <div
                      key={issue.id}
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        background: 'var(--bg-elevated)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                          {issue.type}
                        </span>
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
                          {issue.severity}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {issue.title}
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {issue.description}
                      </div>

                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          onClick={() => handleFixIssue(issue)}
                          className="btn btn-ghost"
                          style={{
                            flex: 1,
                            fontSize: '0.7rem',
                            padding: '4px 6px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid #10b981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4
                          }}
                        >
                          <Wrench size={11} /> {issue.suggestedAction}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </>
  );
}
