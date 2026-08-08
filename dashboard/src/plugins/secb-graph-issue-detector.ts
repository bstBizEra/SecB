/**
 * SecB Knowledge Graph Data Issues Detector & Quality Repair Engine
 * (Inspired by yFiles Interactive Knowledge Graph Showcase)
 */

export interface GraphDataIssue {
  id: string;
  type: 'DUPLICATED_NODE' | 'ISOLATED_NODE' | 'INVALID_EDGE';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  affectedNodeIds: string[];
  suggestedAction: string;
}

const UBIQUITOUS_KEYWORDS = new Set([
  'type', 'properties', 'items', 'required', '$schema', 'enum', 'title',
  'description', 'name', 'status', 'id', 'draft', 'accepted', 'superseded',
  'review-required', 'in', 'out', 'claim', 'source_ref', 'minitems', 'minlength',
  'artifact_id', 'project_id', 'objective', 'scope', 'facts', 'assumptions',
  'unknowns', 'success_criteria', 'decision_id', 'context', 'options', 'decision',
  'consequences', 'evidence_refs', 'owner', 'summary', 'handoff_id', 'source_role',
  'destination_role', 'target_role', 'repo_id', 'file_path', 'commit_sha',
  'actor', 'roles', 'version', 'metadata', 'schema', 'params', 'response', 'body', 'headers'
]);

export function detectKnowledgeGraphIssues(nodes: any[] = [], edges: any[] = []): GraphDataIssue[] {
  const issues: GraphDataIssue[] = [];
  const nodeMap = new Map<string, any>();
  const degreeMap = new Map<string, number>();

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

  // Check for Duplicated Domain Symbol Nodes
  const nameOccurrences = new Map<string, string[]>();
  nodes.forEach(n => {
    const rawName = String(n.name || n.label || n.id).toLowerCase();
    if (rawName.length > 2 && !UBIQUITOUS_KEYWORDS.has(rawName)) {
      if (!nameOccurrences.has(rawName)) nameOccurrences.set(rawName, []);
      nameOccurrences.get(rawName)!.push(String(n.id));
    }
  });

  nameOccurrences.forEach((ids, name) => {
    if (ids.length > 1) {
      issues.push({
        id: `ISSUE-DUP-${name}`,
        type: 'DUPLICATED_NODE',
        severity: 'LOW',
        title: `Duplicated Entity Symbol: "${name}"`,
        description: `Found ${ids.length} separate domain nodes sharing the identical symbol name across different files.`,
        affectedNodeIds: ids,
        suggestedAction: 'Consolidate concepts'
      });
    }
  });

  return issues;
}
