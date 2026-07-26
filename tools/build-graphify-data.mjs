/**
 * SecB Graphify Data Pipeline Tool
 * 
 * Extracts or loads real Graphify AST graph data (`graphify-out/graph.json`)
 * and formats it for interactive visualization in the SecB Governance Dashboard.
 * Enlarges Core Nodes in Native Graphify (vis-network) for immediate visual prominence.
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

  // Enhance Native Graphify HTML (vis-network) to enlarge Core/God Nodes
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
            // Core nodes (degree >= 10 or degree >= 15) get large sizes (45px to 80px)
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

    writeFileSync(resolve(publicHtmlDir, "graph.html"), htmlContent);
    console.log(`[Graphify Pipeline] Synced & enlarged Core Nodes in native graph.html to ${publicHtmlDir}/graph.html`);
  }

  console.log(`[Graphify Pipeline] Successfully wrote ${formattedNodes.length} nodes & ${topCommunities.length} communities to ${publicOutPath}`);
  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("build-graphify-data.mjs")) {
  formatGraphDataForDashboard();
}
