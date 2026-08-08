import React, { useState } from 'react';
import { Sparkles, Search, ShieldCheck, Zap, Download, RefreshCw, CheckCircle2, Lock, Tag, Layers, Database, ExternalLink, Code } from 'lucide-react';

interface SkillItem {
  id: string;
  name: string;
  title: string;
  category: string;
  description: string;
  snippet: string;
  classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  tokensSaved: number;
  toolCompat: string[];
  enabled: boolean;
  author: string;
}

const INITIAL_SKILLS: SkillItem[] = [
  {
    id: 'graphify',
    name: 'graphify',
    title: 'Graphify Knowledge Graph',
    category: 'Architecture',
    description: 'Parse 36+ AST file types, build persistent queryable knowledge graphs, serve MCP tools, and triage PR conflicts.',
    snippet: '# Graphify Skill\nParse AST codebase graph, compute degree centrality & Louvain communities.',
    classification: 'INTERNAL',
    tokensSaved: 42500,
    toolCompat: ['Claude Code', 'Codex', 'Cursor', 'Windsurf'],
    enabled: true,
    author: 'Ruflo Core'
  },
  {
    id: 'claims',
    name: 'claims',
    title: 'Claims-Based Authorization',
    category: 'Security',
    description: 'Claims-based authorization for agents and operations. Grant, revoke, and verify permissions for secure multi-agent coordination.',
    snippet: '# Claims Skill\nGrant, revoke, and verify agent claims & authorization grants.',
    classification: 'RESTRICTED',
    tokensSaved: 38200,
    toolCompat: ['Claude Code', 'Codex'],
    enabled: true,
    author: 'SecB Security'
  },
  {
    id: 'embeddings',
    name: 'embeddings',
    title: 'HNSW Vector Embeddings',
    category: 'Memory',
    description: 'Vector embeddings with HNSW indexing, sql.js persistence, and hyperbolic support. 75x faster semantic search with agentic-flow.',
    snippet: '# Embeddings Skill\n384-dim HNSW vector search with AgentDB persistence.',
    classification: 'INTERNAL',
    tokensSaved: 49100,
    toolCompat: ['Claude Code', 'Codex', 'Cursor'],
    enabled: true,
    author: 'AgentDB'
  },
  {
    id: 'neural-training',
    name: 'neural-training',
    title: 'SONA Neural Pattern Training',
    category: 'AI Learning',
    description: 'Neural pattern training with SONA (Self-Optimizing Neural Architecture), MoE (Mixture of Experts), and EWC++ for knowledge consolidation.',
    snippet: '# Neural Training Skill\nSONA neural pattern consolidation and MoE routing.',
    classification: 'CONFIDENTIAL',
    tokensSaved: 31000,
    toolCompat: ['Claude Code', 'Codex', 'OpenClaw'],
    enabled: false,
    author: 'Flow Nexus'
  },
  {
    id: 'hive-mind',
    name: 'hive-mind',
    title: 'Byzantine Swarm Consensus',
    category: 'Swarm Orchestration',
    description: 'Byzantine fault-tolerant consensus and distributed coordination. Queen-led hierarchical swarm management.',
    snippet: '# Hive Mind Skill\nQueen-led Byzantine fault-tolerant multi-agent consensus.',
    classification: 'RESTRICTED',
    tokensSaved: 54000,
    toolCompat: ['Claude Code', 'Codex'],
    enabled: true,
    author: 'Ruflo Swarm'
  },
  {
    id: 'pair-programming',
    name: 'pair-programming',
    title: 'Driver-Navigator Pair Programming',
    category: 'Development',
    description: 'AI-assisted pair programming with multiple modes (driver/navigator/switch), real-time verification, and quality monitoring.',
    snippet: '# Pair Programming Skill\nReal-time TDD, continuous code review, and role switching.',
    classification: 'PUBLIC',
    tokensSaved: 28400,
    toolCompat: ['Claude Code', 'Codex', 'Cursor', 'Windsurf', 'Copilot CLI'],
    enabled: true,
    author: 'Community'
  }
];

export default function SkillsHub() {
  const [skills, setSkills] = useState<SkillItem[]>(INITIAL_SKILLS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTool, setSelectedTool] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedSnippetId, setExpandedSnippetId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('synced');

  const toolsList = ['All', 'Claude Code', 'Codex', 'Cursor', 'Windsurf', 'OpenClaw'];
  const categoriesList = ['All', 'Architecture', 'Security', 'Memory', 'AI Learning', 'Swarm Orchestration', 'Development'];

  const filteredSkills = skills.filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          skill.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTool = selectedTool === 'All' || skill.toolCompat.includes(selectedTool);
    const matchesCategory = selectedCategory === 'All' || skill.category === selectedCategory;
    return matchesSearch && matchesTool && matchesCategory;
  });

  const totalTokensSaved = skills.reduce((sum, s) => sum + (s.enabled ? s.tokensSaved : 0), 0);
  const activeSkillsCount = skills.filter(s => s.enabled).length;

  const toggleSkillEnabled = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const handleSyncAll = () => {
    setSyncStatus('syncing');
    setTimeout(() => {
      setSyncStatus('synced');
    }, 1200);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner HUD */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
        border: '1px solid var(--border-color, #334155)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Sparkles size={24} color="#38bdf8" />
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>SecB Skills Hub</h1>
            <span style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '20px',
              padding: '2px 10px',
              fontSize: '12px',
              fontWeight: 600
            }}>Governed Registry</span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
            Token-efficient skill resolution, cross-tool symlinks, and governed classification policy checks.
          </p>
        </div>

        {/* Stats 1 */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', marginBottom: '4px' }}>
            <Zap size={16} color="#fbbf24" /> Token Efficiency Saved
          </div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#38bdf8' }}>
            {(totalTokensSaved / 1000).toFixed(1)}k <span style={{ fontSize: '13px', color: '#4ade80', fontWeight: 600 }}>(~95.4% Saved)</span>
          </div>
        </div>

        {/* Stats 2 */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', marginBottom: '4px' }}>
            <Layers size={16} color="#c084fc" /> Active Governed Skills
          </div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#f8fafc' }}>
            {activeSkillsCount} / {skills.length} <span style={{ fontSize: '13px', color: '#94a3b8' }}>Skills Active</span>
          </div>
        </div>

        {/* Sync Button */}
        <div>
          <button
            onClick={handleSyncAll}
            disabled={syncStatus === 'syncing'}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              background: syncStatus === 'syncing' ? '#475569' : 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#fff',
              fontWeight: 600,
              cursor: syncStatus === 'syncing' ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={18} className={syncStatus === 'syncing' ? 'spin' : ''} />
            {syncStatus === 'syncing' ? 'Syncing to Tools...' : 'Sync to Local Agent Tools'}
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search skills by name, description, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px 12px 42px',
              borderRadius: '10px',
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        {/* Tool Selector Pills */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {toolsList.map(tool => (
            <button
              key={tool}
              onClick={() => setSelectedTool(tool)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: selectedTool === tool ? '1px solid #38bdf8' : '1px solid #334155',
                background: selectedTool === tool ? 'rgba(56, 189, 248, 0.15)' : '#0f172a',
                color: selectedTool === tool ? '#38bdf8' : '#94a3b8',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              {tool}
            </button>
          ))}
        </div>
      </div>

      {/* Skills Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: '20px'
      }}>
        {filteredSkills.map(skill => (
          <div
            key={skill.id}
            style={{
              background: '#0f172a',
              border: skill.enabled ? '1px solid #334155' : '1px solid rgba(255,255,255,0.05)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              opacity: skill.enabled ? 1 : 0.6,
              transition: 'all 0.2s'
            }}
          >
            <div>
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>{skill.title}</h3>
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>${skill.name}</span>
                </div>

                {/* Classification Badge */}
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: skill.classification === 'RESTRICTED' ? 'rgba(239, 68, 68, 0.2)' :
                              skill.classification === 'CONFIDENTIAL' ? 'rgba(245, 158, 11, 0.2)' :
                              skill.classification === 'INTERNAL' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                  color: skill.classification === 'RESTRICTED' ? '#f87171' :
                         skill.classification === 'CONFIDENTIAL' ? '#fbbf24' :
                         skill.classification === 'INTERNAL' ? '#60a5fa' : '#4ade80',
                  border: `1px solid ${
                    skill.classification === 'RESTRICTED' ? 'rgba(239, 68, 68, 0.4)' :
                    skill.classification === 'CONFIDENTIAL' ? 'rgba(245, 158, 11, 0.4)' :
                    skill.classification === 'INTERNAL' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(34, 197, 94, 0.4)'
                  }`
                }}>
                  {skill.classification}
                </span>
              </div>

              {/* Description */}
              <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px' }}>
                {skill.description}
              </p>

              {/* Tool Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {skill.toolCompat.map(tool => (
                  <span key={tool} style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    {tool}
                  </span>
                ))}
              </div>
            </div>

            <div>
              {/* Snippet Preview Toggle */}
              {expandedSnippetId === skill.id && (
                <div style={{
                  background: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#38bdf8',
                  whiteSpace: 'pre-wrap'
                }}>
                  {skill.snippet}
                </div>
              )}

              {/* Card Footer Actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '14px',
                borderTop: '1px solid rgba(255,255,255,0.05)'
              }}>
                <button
                  onClick={() => setExpandedSnippetId(expandedSnippetId === skill.id ? null : skill.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Code size={14} />
                  {expandedSnippetId === skill.id ? 'Hide Snippet' : 'Preview Snippet'}
                </button>

                <button
                  onClick={() => toggleSkillEnabled(skill.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: skill.enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    color: skill.enabled ? '#4ade80' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <CheckCircle2 size={14} />
                  {skill.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
