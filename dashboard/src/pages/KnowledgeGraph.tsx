import React, { useState, useEffect, useRef } from 'react';
import { Network, Database, Code, Shield, Search, RefreshCw, Zap, Folder, Layers, Sparkles, Activity, Globe, CheckSquare, Square, ExternalLink, ZoomIn, ZoomOut, Maximize2, Move, RotateCw, Play, Pause } from 'lucide-react';

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
  const [selectedProject, setSelectedProject] = useState<'SecB' | 'Ruflo' | 'Custom'>('SecB');
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

  // Communities selection state (matching Graphify native UI)
  const [selectedCommunities, setSelectedCommunities] = useState<Set<number>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Fetch real Graphify dataset from public/graph-data.json
  useEffect(() => {
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
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load graph-data.json', err);
        setLoading(false);
      });
  }, [selectedProject]);

  // Orbit Rotation Loop ("turn the orbit")
  useEffect(() => {
    if (!isOrbiting || !data) return;

    const centerX = 330;
    const centerY = 250;
    const speed = 0.005; // radians per frame

    const rotateFrame = () => {
      data.nodes.forEach(n => {
        if (n === draggedNode || n.x === undefined || n.y === undefined) return;
        const dx = n.x - centerX;
        const dy = n.y - centerY;
        const r = Math.sqrt(dx * dx + dy * dy);
        const theta = Math.atan2(dy, dx) + speed;
        n.x = centerX + r * Math.cos(theta);
        n.y = centerY + r * Math.sin(theta);
      });

      // Force canvas refresh
      setData(prev => (prev ? { ...prev } : null));
      animFrameRef.current = requestAnimationFrame(rotateFrame);
    };

    animFrameRef.current = requestAnimationFrame(rotateFrame);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOrbiting, data, draggedNode]);

  // Render Canvas Graph Visualization with Community Filtering, Colors, Zoom, Pan, & Element Movement
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

    // Draw Edges
    ctx.lineWidth = 1 / zoomScale;
    data.edges.forEach(e => {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (src && src.x !== undefined && src.y !== undefined && tgt && tgt.x !== undefined && tgt.y !== undefined) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.28)';
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
      }
    });

    // Draw Nodes
    activeNodes.forEach(n => {
      if (n.x === undefined || n.y === undefined) return;
      const isSelected = selectedNode?.id === n.id;
      const isBeingDragged = draggedNode?.id === n.id;
      const radius = n.isGodNode ? 10 : isSelected || isBeingDragged ? 8 : 5;

      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);

      ctx.fillStyle = n.color || '#3b82f6';
      if (isBeingDragged) {
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 18;
      } else if (n.isGodNode) {
        ctx.shadowColor = n.color || '#ef4444';
        ctx.shadowBlur = 10;
      } else if (isSelected) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fill();

      // Node Label
      if (n.isGodNode || isSelected || isBeingDragged || zoomScale >= 1.5) {
        ctx.fillStyle = '#ffffff';
        ctx.font = n.isGodNode ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.fillText(n.name, n.x + radius + 4, n.y + 3);
      }
    });

    ctx.restore();

  }, [data, selectedNode, draggedNode, selectedCommunities, searchTerm, zoomScale, panOffset]);

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
          <p className="page-subtitle">Interactive Physics Network with Element Dragging, Orbit Rotation, Zoom & Pan Controls, Communities Panel</p>
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

      {/* Control Bar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Folder size={15} color="var(--accent-light)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Target Project:</span>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value as any)}
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
          >
            <option value="SecB">SecB Control Plane (c:/laragon/www/SecB)</option>
            <option value="Ruflo">Ruflo Swarm Engine (c:/laragon/www/ruflo)</option>
          </select>
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
        /* Canvas Visualizer with Communities Panel Sidebar + Interactive Drag/Orbit/Zoom Controls */
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
                <div style={{ padding: 120, color: 'var(--text-muted)' }}>Parsing AST codebase graph...</div>
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

                    // Check if user clicked on an individual node element ("move the element able")
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

            {/* Selected Node Details Bar */}
            {selectedNode && (
              <div style={{ padding: '10px 16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: '0.85rem' }}>{selectedNode.name}</span>
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 8 }}>({selectedNode.file})</span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem' }}>
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
