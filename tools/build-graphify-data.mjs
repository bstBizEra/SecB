/**
 * SecB Graphify Data Pipeline Tool
 * 
 * Extracts or loads real Graphify AST graph data (`graphify-out/graph.json`)
 * and formats it for interactive visualization in the SecB Governance Dashboard.
 * Auto-relinks isolated orphan nodes and enlarges Core Nodes in Native Graphify.
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
  console.error(`[Graphify Pipeline] Running AST extraction on ${targetDir}...`);
  try {
    execSync(`python -m graphify extract "${targetDir}" --code-only`, { stdio: "inherit", cwd: targetDir });
    execSync(`python -m graphify cluster-only "${targetDir}" --no-label`, { stdio: "inherit", cwd: targetDir });
  } catch (err) {
    console.warn(`[Graphify Pipeline] Extraction warning: ${err.message}`);
  }
}

// Diagnostics go to stderr, never stdout: this module is reachable from the MCP
// server (secb_graph_build), where stdout is the JSON-RPC channel. A progress
// line there corrupted the frame stream for the client and leaked an absolute
// repository path into it.
export function formatGraphDataForDashboard(options = { writeAssets: true }) {
  const shouldWrite = options?.writeAssets ?? true;
  const sourceGraphPath = options?.graphPath ? resolve(options.graphPath) : graphifyJsonPath;
  if (!existsSync(sourceGraphPath)) {
    if (shouldWrite) runGraphifyExtraction();
  }

  console.error(`[Graphify Pipeline] Loading ${sourceGraphPath}...`);
  const raw = JSON.parse(readFileSync(sourceGraphPath, "utf8"));

  const rawNodes = raw.nodes ?? [];
  let rawLinks = raw.links ?? raw.edges ?? [];

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

  // Auto-relink isolated orphan nodes (degree = 0) to their corresponding companion scripts
  rawNodes.forEach(node => {
    const id = String(node.id);
    const deg = degreeMap.get(id) ?? degreeMap.get(node.label) ?? 0;
    if (deg === 0) {
      if (id.includes("install_claude_ps1")) {
        const shId = rawNodes.find(n => String(n.id).includes("install_claude_sh"))?.id || "agents_install_install_claude_sh_agents_install_install_claude";
        rawLinks.push({ source: id, target: shId, relationship: "companion_script" });
        degreeMap.set(id, 1);
        degreeMap.set(shId, (degreeMap.get(shId) ?? 0) + 1);
      } else if (id.includes("install_codex_ps1")) {
        const shId = rawNodes.find(n => String(n.id).includes("install_codex_sh"))?.id || "agents_install_install_codex_sh_agents_install_install_codex";
        rawLinks.push({ source: id, target: shId, relationship: "companion_script" });
        degreeMap.set(id, 1);
        degreeMap.set(shId, (degreeMap.get(shId) ?? 0) + 1);
      }
    }
  });

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

  // GOV-MCP-03: this pair was NOT gated on shouldWrite, unlike the writes at the
  // end of this function. secb_graph_build calls in with writeAssets:false and
  // still rewrote dashboard/public/graph-data.json on every invocation, so the
  // MCP server mutated the repository on a tool declared strictly read-only.
  // The guarding test asserted only node counts and never inspected the
  // filesystem, which is why a full suite stayed green over it.
  if (shouldWrite) {
    mkdirSync(resolve(projectRoot, "dashboard", "public"), { recursive: true });
    writeFileSync(publicOutPath, JSON.stringify(payload, null, 2));
  }

  // Enhance Native Graphify HTML (vis-network) with Working Toolbar Button Actions
  if (existsSync(graphifyHtmlPath)) {
    // Also gated: creating the output directory is itself a disk mutation, so an
    // ungated mkdir broke GOV-MCP-03 even when every write below was skipped.
    if (shouldWrite) mkdirSync(publicHtmlDir, { recursive: true });
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

    // Google Earth Style Translucent Glassmorphic HUD CSS
    const toolbarCss = `
<style>
.yfiles-toolbar {
  position: absolute; top: 14px; left: 14px; z-index: 9999;
  background: rgba(15, 23, 42, 0.55) !important;
  backdrop-filter: blur(14px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(14px) saturate(180%) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  border-radius: 10px !important;
  padding: 8px 14px !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37) !important;
  font-family: system-ui, -apple-system, sans-serif !important;
  font-size: 12px !important;
  color: #f1f5f9 !important;
  user-select: none !important;
}
.yfiles-toolbar button {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #f8fafc !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  padding: 6px 12px !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
  backdrop-filter: blur(6px) !important;
}
.yfiles-toolbar button:hover {
  background: rgba(56, 189, 248, 0.3) !important;
  color: #ffffff !important;
  border-color: rgba(56, 189, 248, 0.7) !important;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.5) !important;
  transform: translateY(-1px);
}
.yfiles-toolbar button:active {
  transform: translateY(0);
}
.yfiles-toolbar .separator {
  width: 1px !important;
  height: 20px !important;
  background: rgba(255, 255, 255, 0.2) !important;
  margin: 0 4px !important;
}
.yfiles-toolbar .search-container {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  background: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  padding: 4px 10px !important;
  border-radius: 6px !important;
  transition: all 0.2s ease !important;
}
.yfiles-toolbar .search-container:focus-within {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.5) !important;
}
.yfiles-toolbar input[type="search"] {
  background: transparent !important;
  border: none !important;
  color: #ffffff !important;
  font-size: 12px !important;
  outline: none !important;
  width: 130px !important;
}
.yfiles-toolbar label {
  cursor: pointer !important;
  user-select: none !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-weight: 500 !important;
}
</style>
`;

    // SVG Icon Toolbar HTML with Robust Multi-Target Click Action Dispatcher
    const toolbarHtml = `
<div class="toolbar yfiles-toolbar" data-tip-id="toolbar">
  <div class="toolbar-overflow-container"></div>
  <button class="toolbar-overflow-button" title="More..." style="display: none;">more_horiz</button>
  
  <button data-command="DECREASE_ZOOM" id="zoom-out-button" title="Decrease zoom" onclick="performVisZoom(0.8)">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    Decrease Zoom
  </button>

  <button data-command="INCREASE_ZOOM" id="zoom-in-button" title="Increase zoom" onclick="performVisZoom(1.25)">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    Increase Zoom
  </button>

  <button data-command="FIT_GRAPH_BOUNDS" id="fit-graph-button" title="Fit content" onclick="performVisFit()">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
    Fit Content
  </button>

  <span class="separator"></span>
  <div>
    <input type="checkbox" id="teams-view" title="Organizes the graph in teams" class="demo-toggle-button" onchange="toggleGroupTeamsMode(this.checked)">
    <label for="teams-view" title="Rearrange the graph so teammates are positioned near each other">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Group By Teams
    </label>
  </div>

  <span class="separator"></span>
  <div class="search-container">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="search" id="searchBox" placeholder="Search nodes..." oninput="if(window.filterVisNodes) window.filterVisNodes(this.value)">
  </div>
</div>

<script>
function getActiveVisNetwork() {
  return typeof network !== 'undefined' ? network : window.network;
}

window.performVisZoom = function(factor) {
  var net = getActiveVisNetwork();
  if (net) {
    var curScale = net.getScale();
    net.moveTo({ scale: curScale * factor, animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
  }
};

window.performVisFit = function() {
  var net = getActiveVisNetwork();
  if (net) {
    net.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  }
};

window.toggleGroupTeamsMode = function(checked) {
  var net = getActiveVisNetwork();
  var ds = typeof nodesDS !== 'undefined' ? nodesDS : window.nodesDataset;
  if (!net || !ds) return;
  var nodes = ds.get();
  if (checked) {
    var commCenters = {};
    var comms = [...new Set(nodes.map(n => n.community || 0))];
    var K = comms.length || 1;
    comms.forEach((c, idx) => {
      var angle = (idx * 2 * Math.PI) / K;
      commCenters[c] = { x: 400 * Math.cos(angle), y: 400 * Math.sin(angle) };
    });
    var updated = nodes.map(n => {
      var center = commCenters[n.community || 0] || { x: 0, y: 0 };
      return { id: n.id, x: center.x + (Math.random() * 80 - 40), y: center.y + (Math.random() * 80 - 40) };
    });
    ds.update(updated);
  } else {
    net.stabilize();
  }
};

window.filterVisNodes = function(query) {
  var ds = typeof nodesDS !== 'undefined' ? nodesDS : window.nodesDataset;
  if (!ds) return;
  var q = (query || '').toLowerCase().trim();
  var nodes = ds.get();
  var updated = nodes.map(n => {
    var match = !q || (n.label && n.label.toLowerCase().includes(q)) || (n.title && n.title.toLowerCase().includes(q));
    return { id: n.id, hidden: !match };
  });
  ds.update(updated);
};

window.addEventListener('message', function(e) {
  if (!e.data) return;
  var action = e.data.action;
  if (action === 'zoomIn') window.performVisZoom(1.25);
  if (action === 'zoomOut') window.performVisZoom(0.8);
  if (action === 'fit') window.performVisFit();
  if (action === 'toggleTeams') window.toggleGroupTeamsMode(e.data.val);
  if (action === 'search') window.filterVisNodes(e.data.val);
});
</script>
`;

    if (htmlContent.includes('yfiles-toolbar')) {
      htmlContent = htmlContent.replace(/<style>\s*\.yfiles-toolbar.*?<\/style>/s, toolbarCss);
      htmlContent = htmlContent.replace(/<div class="toolbar yfiles-toolbar".*?<\/script>/s, toolbarHtml);
    } else {
      htmlContent = htmlContent.replace('</head>', `${toolbarCss}</head>`);
      htmlContent = htmlContent.replace('<body>', `<body>${toolbarHtml}`);
    }

    if (shouldWrite) {
      writeFileSync(resolve(publicHtmlDir, "graph.html"), htmlContent);
      console.error(`[Graphify Pipeline] Synced working toolbar button actions in native graph.html to ${publicHtmlDir}/graph.html`);
    }
  }

  if (shouldWrite) {
    writeFileSync(publicOutPath, JSON.stringify(payload, null, 2));
    console.error(`[Graphify Pipeline] Successfully wrote ${formattedNodes.length} nodes & ${topCommunities.length} communities to ${publicOutPath}`);
  }
  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("build-graphify-data.mjs")) {
  formatGraphDataForDashboard();
}
