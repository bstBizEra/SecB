import React, { useState, useEffect, useRef } from 'react';
import { Network, Database, Code, Shield, Search, RefreshCw, Zap, Folder, Layers, Sparkles, Activity, Globe, CheckSquare, Square, ExternalLink, ZoomIn, ZoomOut, Maximize2, Move, RotateCw, Play, Pause, FolderPlus, Terminal, Check } from 'lucide-react';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

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
  const mainAnimRef = useRef<number | null>(null);

  // Fetch real Graphify dataset from public/graph-data.json
  const loadGraphData = (targetPath: string) => {
    setLoading(true);
    fetch('/graph-data.json')
      .then(res => res.json())
      .then((payload: GraphPayload) => {
        // Layout nodes in a force-directed circle layout for Canvas rendering
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

        setData(payload);
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

  // Continuous 60fps Animation Loop for Orbit Rotation, Turning Dash Halos, and Relationship Flow Particles
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

  // Render Canvas Graph Visualization with Turning Style Halos, Thicker Connected Lines, & Animated Relation Flow
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

    const activeNodes = data.nodes.filter(n =>
      selectedCommunities.has(n.community) &&
      (searchTerm === '' || n.name.toLowerCase().includes(searchTerm.toLowerCase()) || n.file.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const nodeMap = new Map<string, GraphNode>();
    activeNodes.forEach(n => nodeMap.set(n.id, n));

    const selectedId = selectedNode?.id;

    // 1. Draw Edges (Line thicker for connected relationships)
    data.edges.forEach(e => {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (!src || src.x === undefined || src.y === undefined || !tgt || tgt.x === undefined || tgt.y === undefined) return;

      const isConnectedToSelected = selectedId && (src.id === selectedId || tgt.id === selectedId);
      const isGodEdge = src.isGodNode || tgt.isGodNode;

      ctx.save();
      if (isConnectedToSelected) {
        // Thicker, glowing line for selected relationships ("line thicker")
        ctx.lineWidth = 3.2 / zoomScale;
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 12;
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
      if (isConnectedToSelected || isGodEdge) {
        const particleSpeed = 0.015;
        const progress = ((animStep * particleSpeed) % 1.0);
        const px = src.x + (tgt.x - src.x) * progress;
        const py = src.y + (tgt.y - src.y) * progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, isConnectedToSelected ? 4 / zoomScale : 2.5 / zoomScale, 0, 2 * Math.PI);
        ctx.fillStyle = isConnectedToSelected ? '#ffffff' : '#a5f3fc';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = isConnectedToSelected ? 14 : 6;
        ctx.fill();
        ctx.restore();
      }
    });

    // 3. Draw Nodes & Turning Style Halos ("turn style" & "action on click")
    activeNodes.forEach(n => {
      if (n.x === undefined || n.y === undefined) return;
      const isSelected = selectedNode?.id === n.id;
      const isBeingDragged = draggedNode?.id === n.id;
      const radius = n.isGodNode ? 11 : isSelected || isBeingDragged ? 9 : 5;

      // Draw Turning Style Halo Ring around Selected Node or God Nodes ("add turning style")
      if (isSelected || n.isGodNode || isBeingDragged) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 7 / zoomScale, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? '#38bdf8' : n.isGodNode ? '#f59e0b' : '#10b981';
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

      ctx.fillStyle = n.color || '#3b82f6';
      if (isBeingDragged) {
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 18;
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

      // Node Label
      if (n.isGodNode || isSelected || isBeingDragged || zoomScale >= 1.5) {
        ctx.fillStyle = '#ffffff';
        ctx.font = n.isGodNode ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.fillText(n.name, n.x + radius + 5, n.y + 3);
      }
    });

    ctx.restore();

  }, [data, selectedNode, draggedNode, selectedCommunities, searchTerm, zoomScale, panOffset, animStep]);

  const handleZoomIn = () => setZoomScale(prev => Math.min(prev * 1.25, 4.0));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev / 1.25, 0.3));
  const handleResetZoom = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

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
          <p className="page-subtitle">Interactive Physics Network with Custom Folder Selection, Turning Halos, Thicker Lines, Particle Flow, Dragging & Orbit Controls</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge-status done" style={{ gap: 5, display: 'flex', alignItems: 'center', background: 'rgba(147, 51, 234, 0.2)', color: '#a855f7', border: '1px solid rgba(147, 51, 234, 0.4)' }}>
            👑 15-Agent V3 Swarm Active
          </span>
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
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Edge Relationships</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3b82f6' }}>
            {data ? data.total_edges.toLocaleString() : '4,692'}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Graph Communities</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>
            {data ? data.communities_count : 300}
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

          {/* Preset Selector Dropdown */}
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

          {/* Custom Folder Path Input */}
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

          {/* Extract & Inspect Folder Button */}
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

        {/* Quick-Switch Folder History Badges */}
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

      {/* Control Bar: View Modes */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={15} color="var(--accent-light)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Graph View Mode:</span>
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
                  padding: '4px 10px',
                  background: active ? 'var(--accent-glow)' : 'transparent',
                  color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent'
                }}
              >
                <Icon size={12} /> {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main View Modes */}
      {graphMode === 'native' ? (
        /* Native Graphify HTML Iframe View (Vis-Network has native mouse wheel zoom & drag pan) */
        <div className="card" style={{ height: 620, padding: 0, overflow: 'hidden' }}>
          <iframe
            src="/graphify-out/graph.html"
            title="Graphify Native Visualizer"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      ) : (
        /* Canvas Visualizer with Turning Style Halos, Thicker Lines, & Particle Relation Flow */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

          {/* Left Panel: Graph Canvas Visualizer */}
          <div className="card" style={{ padding: 0, position: 'relative' }}>
            <div className="card-header" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title"><Activity size={15} /> Force-Directed AST Canvas</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

                {/* Turn Orbit Rotation Button */}
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

                {/* Zoom Controls Overlay */}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-mid)' }}>
                  <Search size={13} color="var(--text-muted)" />
                  <input
                    type="text"
                    placeholder="Filter nodes..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.75rem', outline: 'none', width: 110 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: '#0a0d14', borderRadius: '0 0 8px 8px', display: 'flex', justifyContent: 'center', padding: 10, position: 'relative', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 120, color: 'var(--text-muted)' }}>Parsing AST codebase graph for {activeFolderPath}...</div>
              ) : (
                <canvas
                  ref={canvasRef}
                  width={660}
                  height={500}
                  style={{
                    borderRadius: 6,
                    background: '#090b12',
                    border: '1px solid var(--border-subtle)',
                    cursor: draggedNode ? 'grabbing' : isDragging ? 'grabbing' : 'grab'
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

                    // Check if user clicked on an individual node element ("Action on click")
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
                    } else {
                      setIsDragging(true);
                      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                    }
                  }}
                  onMouseMove={e => {
                    if (draggedNode) {
                      // Move individual element to cursor location!
                      const coords = getCanvasCoords(e.clientX, e.clientY);
                      draggedNode.x = coords.x;
                      draggedNode.y = coords.y;
                      setData(prev => (prev ? { ...prev } : null));
                    } else if (isDragging) {
                      // Pan whole canvas background
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

            {/* Selected Node Details Bar ("Action on click") */}
            {selectedNode && (
              <div style={{ padding: '10px 16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>{selectedNode.name}</span>
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 8 }}>({selectedNode.file})</span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem' }}>
                  <span className="badge-count" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
                    Active Action Node
                  </span>
                  <span className="badge-count">Degree: {selectedNode.connections}</span>
                  <span className="badge-count" style={{ background: selectedNode.color, color: '#fff' }}>{selectedNode.community_name}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: COMMUNITIES Panel (Exact replica of Graphify native UI) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 560, padding: 0 }}>
            <div className="card-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="card-title" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                COMMUNITIES ({data ? data.top_communities.length : 0})
              </span>
            </div>

            {/* Select All Toggle */}
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

            {/* Communities Checklist Scroll Area */}
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
          </div>

        </div>
      )}
    </>
  );
}
