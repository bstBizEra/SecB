/**
 * SecB Graphify Data Pipeline Tool
 * 
 * Extracts or loads real Graphify AST graph data (`graphify-out/graph.json`)
 * and formats it for interactive visualization in the SecB Governance Dashboard.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const graphifyOutDir = resolve(projectRoot, "graphify-out");
const graphifyJsonPath = resolve(graphifyOutDir, "graph.json");
const publicOutPath = resolve(projectRoot, "dashboard", "public", "graph-data.json");

export function runGraphifyExtraction(targetDir = projectRoot) {
  console.log(`[Graphify Pipeline] Running AST extraction on ${targetDir}...`);
  try {
    execSync(`python -m graphify extract "${targetDir}" --code-only`, { stdio: "inherit", cwd: targetDir });
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
  for (const link of rawLinks) {
    const src = link.source;
    const tgt = link.target;
    degreeMap.set(src, (degreeMap.get(src) ?? 0) + 1);
    degreeMap.set(tgt, (degreeMap.get(tgt) ?? 0) + 1);
  }

  // Format top 100 nodes for high-speed UI rendering
  const formattedNodes = rawNodes.slice(0, 150).map(n => {
    const deg = degreeMap.get(n.id) ?? degreeMap.get(n.label) ?? 0;
    return {
      id: String(n.id ?? n.label),
      name: String(n.label ?? n.id),
      file: String(n.source_file ?? n.file_path ?? "source"),
      type: String(n.file_type ?? n.metadata?.kind ?? "code"),
      community: n.community ?? 0,
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
    communities: raw.graph?.communities ?? 301,
    nodes: formattedNodes,
    edges: formattedEdges
  };

  mkdirSync(resolve(projectRoot, "dashboard", "public"), { recursive: true });
  writeFileSync(publicOutPath, JSON.stringify(payload, null, 2));
  console.log(`[Graphify Pipeline] Successfully wrote ${formattedNodes.length} nodes & ${formattedEdges.length} edges to ${publicOutPath}`);
  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("build-graphify-data.mjs")) {
  formatGraphDataForDashboard();
}
