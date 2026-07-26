/**
 * SecB Graphify Data Pipeline Tool
 * 
 * Extracts or loads real Graphify AST graph data (`graphify-out/graph.json`)
 * and formats it for interactive visualization in the SecB Governance Dashboard.
 * Enlarges Core Nodes & injects yFiles Control Panel Toolbar in Native Graphify (vis-network).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const graphifyOutDir = resolve(projectRoot, "graphify-out");
const graphifyJsonPath = resolve(graphifyOutDir, "graph.json");
const graphifyHtmlPath = resolve(graphifyOutDir, "graph.html");
const publicOutPath = resolve(projectRoot, "dashboard", "public", "graph-data.json");
const publicHtmlDir = resolve(projectRoot, "dashboard", "public", "graphify-out");

const COLOR_PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'
];

export function runGraphifyExtraction(targetDir = projectRoot) {
  console.log(`[Graphify Pipeline] Running AST extraction on ${targetDir}...`);
  try {
    execSync(`python -m graphify extract "${targetDir}" --code-only`, { stdio: "inherit", cwd: targetDir });
    execSync(`python -m graphify cluster-only "${targetDir}" --no-label`, { stdio: "inherit", cwd: targetDir });
  } catch (err) {
    console.warn(`[Graphify Pipeline] Extraction warning: ${err.message}`);
  }
}

export function formatGraphDataForDashboard() {
  if (!existsSync(graphifyJsonPath)) {
    runGraphifyExtraction();
  }

  console.log(`[Graphify Pipeline] Loading ${graphifyJsonPath}...`);
  const raw = JSON.parse(readFileSync(graphifyJsonPath, "utf8"));

  const rawNodes = raw.nodes ?? [];
  const rawLinks = raw.links ?? raw.edges ?? [];

  // Count node connections (degree centrality)
  const degreeMap = new Map();
  const communityCounts = new Map();
  const communityNameMap = new Map();

  for (const link of rawLinks) {
    const src = link.source;
    const tgt = link.target;
    degreeMap.set(src, (degreeMap.get(src) ?? 0) + 1);
    degreeMap.set(tgt, (degreeMap.get(tgt) ?? 0) + 1);
  }

  for (const node of rawNodes) {
    const commId = node.community ?? 0;
    const commName = node.community_name ?? `Community ${commId}`;
    communityCounts.set(commId, (communityCounts.get(commId) ?? 0) + 1);
    communityNameMap.set(commId, commName);
  }

  // Build top communities list for Communities Sidebar (matching native Graphify UI)
  const topCommunities = Array.from(communityCounts.entries())
    .map(([id, count]) => ({
      id,
      name: communityNameMap.get(id) ?? `Community ${id}`,
      count,
      color: COLOR_PALETTE[id % COLOR_PALETTE.length]
    }))
    .sort((a, b) => b.count - a.count);

  // Format top nodes for high-speed UI rendering
  const formattedNodes = rawNodes.slice(0, 150).map(n => {
    const deg = degreeMap.get(n.id) ?? degreeMap.get(n.label) ?? 0;
    const commId = n.community ?? 0;
    return {
      id: String(n.id ?? n.label),
      name: String(n.label ?? n.id),
      file: String(n.source_file ?? n.file_path ?? "source"),
      type: String(n.file_type ?? n.metadata?.kind ?? "code"),
      community: commId,
      community_name: communityNameMap.get(commId) ?? `Community ${commId}`,
      color: COLOR_PALETTE[commId % COLOR_PALETTE.length],
      connections: deg,
      isGodNode: deg >= 15
    };
  });

  const nodeSet = new Set(formattedNodes.map(n => n.id));

  // Filter links for formatted nodes
  const formattedEdges = rawLinks
    .filter(l => nodeSet.has(String(l.source)) && nodeSet.has(String(l.target)))
    .slice(0, 200)
    .map(l => ({
      source: String(l.source),
      target: String(l.target),
      relationship: String(l.relationship ?? l.label ?? "depends_on")
    }));

  const payload = {
    generated_at: new Date().toISOString(),
    total_nodes: rawNodes.length,
    total_edges: rawLinks.length,
    communities_count: raw.graph?.communities ?? topCommunities.length,
    top_communities: topCommunities,
    nodes: formattedNodes,
    edges: formattedEdges
  };

  mkdirSync(resolve(projectRoot, "dashboard", "public"), { recursive: true });
  writeFileSync(publicOutPath, JSON.stringify(payload, null, 2));

  // Enhance Native Graphify HTML (vis-network) with yFiles Control Panel Toolbar & enlarged Core Nodes
  if (existsSync(graphifyHtmlPath)) {
    mkdirSync(publicHtmlDir, { recursive: true });
    let htmlContent = readFileSync(graphifyHtmlPath, "utf8");

    // Transform node sizes in RAW_NODES JS array inside graph.html
    htmlContent = htmlContent.replace(
      /const RAW_NODES = (\[.*?\]);/s,
      (match, jsonStr) => {
        try {
          const nodes = JSON.parse(jsonStr);
          const enhanced = nodes.map((n) => {
            const deg = n.degree ?? 0;
            if (deg >= 15) {
              n.size = 65.0 + (deg * 0.8);
              n.font = { size: 16, color: "#ffffff" };
            } else if (deg >= 8) {
              n.size = 42.0 + (deg * 0.9);
              n.font = { size: 13, color: "#ffffff" };
            } else if (deg >= 3) {
              n.size = 24.0 + (deg * 0.5);
              n.font = { size: 10, color: "#e2e8f0" };
            } else {
              n.size = 12.0;
              n.font = { size: 0, color: "#ffffff" };
            }
            return n;
          });
          return `const RAW_NODES = ${JSON.stringify(enhanced)};`;
        } catch (e) {
          return match;
        }
      }
    );

    // Inject yFiles Control Panel Toolbar CSS & HTML into native graph.html
    const toolbarCss = `
<style>
.yfiles-toolbar {
  position: absolute; top: 12px; left: 12px; z-index: 999;
  background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 8px;
  padding: 8px 14px; display: flex; align-items: center; gap: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5); font-family: sans-serif; font-size: 13px; color: #e0e0e0;
}
.yfiles-toolbar button {
  background: #2a2a4e; color: #38bdf8; border: 1px solid #3a3a5e;
  padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: 600;
  display: flex; align-items: center; gap: 4px; transition: all 0.15s ease;
}
.yfiles-toolbar button:hover { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.yfiles-toolbar .separator { width: 1px; height: 18px; background: #3a3a5e; margin: 0 2px; }
.yfiles-toolbar input[type="search"] {
  background: #0f0f1a; border: 1px solid #3a3a5e; color: #fff;
  padding: 5px 8px; border-radius: 4px; font-size: 12px; outline: none; width: 130px;
}
.yfiles-toolbar input[type="search"]:focus { border-color: #38bdf8; }
.yfiles-toolbar label { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px; }
</style>
`;

    const toolbarHtml = `
<div class="toolbar yfiles-toolbar" data-tip-id="toolbar">
  <div class="toolbar-overflow-container"></div>
  <button class="toolbar-overflow-button" title="More..." style="display: none;">more_horiz</button>
  <button data-command="DECREASE_ZOOM" id="zoom-out-button" title="Decrease zoom" onclick="if(window.network) window.network.moveTo({scale: window.network.getScale() * 0.75, animation: true});">
    Zoom Out
  </button>
  <button data-command="INCREASE_ZOOM" id="zoom-in-button" title="Increase zoom" onclick="if(window.network) window.network.moveTo({scale: window.network.getScale() * 1.25, animation: true});">
    Zoom In
  </button>
  <button data-command="FIT_GRAPH_BOUNDS" id="fit-graph-button" title="Fit content" onclick="if(window.network) window.network.fit({animation: true});">
    Fit Content
  </button>

  <span class="separator"></span>
  <div>
    <input type="checkbox" id="teams-view" title="Organizes the graph in teams" class="demo-toggle-button" onchange="toggleGroupTeamsMode(this.checked)">
    <label for="teams-view" title="Rearrange the graph so teammates are positioned near each other">
      Group By Teams
    </label>
  </div>

  <span class="separator"></span>
  <span>
    <label for="searchBox">Search:</label>
    <input type="search" id="searchBox" oninput="if(window.filterVisNodes) window.filterVisNodes(this.value)">
  </span>
</div>

<script>
window.toggleGroupTeamsMode = function(checked) {
  if (!window.network || !window.nodesDataset) return;
  const nodes = window.nodesDataset.get();
  if (checked) {
    const commCenters = {};
    const comms = [...new Set(nodes.map(n => n.community || 0))];
    const K = comms.length || 1;
    comms.forEach((c, idx) => {
      const angle = (idx * 2 * Math.PI) / K;
      commCenters[c] = { x: 400 * Math.cos(angle), y: 400 * Math.sin(angle) };
    });
    const updated = nodes.map(n => {
      const center = commCenters[n.community || 0] || { x: 0, y: 0 };
      return { id: n.id, x: center.x + (Math.random() * 80 - 40), y: center.y + (Math.random() * 80 - 40) };
    });
    window.nodesDataset.update(updated);
  } else {
    window.network.stabilize();
  }
};

window.filterVisNodes = function(query) {
  if (!window.nodesDataset) return;
  const q = (query || '').toLowerCase();
  const nodes = window.nodesDataset.get();
  const updated = nodes.map(n => {
    const match = !q || (n.label && n.label.toLowerCase().includes(q)) || (n.title && n.title.toLowerCase().includes(q));
    return { id: n.id, hidden: !match };
  });
  window.nodesDataset.update(updated);
};

window.addEventListener('message', function(e) {
  if (!e.data || !window.network) return;
  const { action, val } = e.data;
  if (action === 'zoomIn') window.network.moveTo({ scale: window.network.getScale() * 1.25, animation: true });
  if (action === 'zoomOut') window.network.moveTo({ scale: window.network.getScale() * 0.75, animation: true });
  if (action === 'fit') window.network.fit({ animation: true });
  if (action === 'toggleTeams') window.toggleGroupTeamsMode(val);
  if (action === 'search') window.filterVisNodes(val);
});
</script>
`;

    if (!htmlContent.includes('yfiles-toolbar')) {
      htmlContent = htmlContent.replace('</head>', `${toolbarCss}</head>`);
      htmlContent = htmlContent.replace('<body>', `<body>${toolbarHtml}`);
    }

    writeFileSync(resolve(publicHtmlDir, "graph.html"), htmlContent);
    console.log(`[Graphify Pipeline] Synced yFiles toolbar & enlarged Core Nodes in native graph.html to ${publicHtmlDir}/graph.html`);
  }

  console.log(`[Graphify Pipeline] Successfully wrote ${formattedNodes.length} nodes & ${topCommunities.length} communities to ${publicOutPath}`);
  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("build-graphify-data.mjs")) {
  formatGraphDataForDashboard();
}
