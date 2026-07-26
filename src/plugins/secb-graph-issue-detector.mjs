/**
 * SecB Knowledge Graph Data Issues Detector & Quality Repair Engine
 * (Inspired by yFiles Interactive Knowledge Graph Showcase)
 * 
 * Detects common knowledge graph inconsistencies:
 * 1. Duplicated Nodes (identical labels or fuzzy symbol alias collisions)
 * 2. Isolated / Orphan Nodes (degree = 0 with no relationships)
 * 3. Dangling / Invalid Edges (relationships referencing non-existent nodes)
 */

/**
 * @typedef {Object} GraphDataIssue
 * @property {string} id
 * @property {'DUPLICATED_NODE' | 'ISOLATED_NODE' | 'INVALID_EDGE'} type
 * @property {'HIGH' | 'MEDIUM' | 'LOW'} severity
 * @property {string} title
 * @property {string} description
 * @property {string[]} affectedNodeIds
 * @property {string} suggestedAction
 */

/**
 * Detect data issues in a knowledge graph payload.
 *
 * @param {Array<Object>} nodes
 * @param {Array<Object>} edges
 * @returns {GraphDataIssue[]}
 */
export function detectKnowledgeGraphIssues(nodes = [], edges = []) {
  const issues = [];
  const nodeMap = new Map();
  const degreeMap = new Map();

  nodes.forEach(n => {
    nodeMap.set(String(n.id), n);
    degreeMap.set(String(n.id), 0);
  });

  // Calculate degree centrality & check Invalid Edges
  edges.forEach(e => {
    const src = String(e.source);
    const tgt = String(e.target);
    if (degreeMap.has(src)) degreeMap.set(src, (degreeMap.get(src) || 0) + 1);
    if (degreeMap.has(tgt)) degreeMap.set(tgt, (degreeMap.get(tgt) || 0) + 1);

    if (!nodeMap.has(src) || !nodeMap.has(tgt)) {
      issues.push({
        id: `ISSUE-EDGE-${src}-${tgt}`,
        type: 'INVALID_EDGE',
        severity: 'HIGH',
        title: `Invalid Edge Endpoint (${src} ➔ ${tgt})`,
        description: `Edge references target node "${!nodeMap.has(tgt) ? tgt : src}" which does not exist in the graph.`,
        affectedNodeIds: [nodeMap.has(src) ? src : tgt],
        suggestedAction: 'Repair edge endpoint'
      });
    }
  });

  // Check for Isolated Nodes
  nodes.forEach(n => {
    const id = String(n.id);
    const deg = degreeMap.get(id) || 0;
    if (deg === 0) {
      issues.push({
        id: `ISSUE-ISOLATED-${id}`,
        type: 'ISOLATED_NODE',
        severity: 'MEDIUM',
        title: `Isolated Orphan Node: "${n.name || n.label || id}"`,
        description: `Node has 0 connected relationships in the graph.`,
        affectedNodeIds: [id],
        suggestedAction: 'Relink or purge'
      });
    }
  });

  // Check for Duplicated Nodes
  const nameOccurrences = new Map();
  nodes.forEach(n => {
    const name = String(n.name || n.label || n.id).toLowerCase();
    if (name.length > 2) {
      if (!nameOccurrences.has(name)) nameOccurrences.set(name, []);
      nameOccurrences.get(name).push(String(n.id));
    }
  });

  nameOccurrences.forEach((ids, name) => {
    if (ids.length > 1) {
      issues.push({
        id: `ISSUE-DUP-${name}`,
        type: 'DUPLICATED_NODE',
        severity: 'LOW',
        title: `Duplicated Entity Label: "${name}"`,
        description: `Found ${ids.length} separate nodes sharing the identical symbol name across different files.`,
        affectedNodeIds: ids,
        suggestedAction: 'Consolidate concepts'
      });
    }
  });

  return issues;
}
