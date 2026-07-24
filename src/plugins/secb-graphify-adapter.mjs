/**
 * SecB Graphify Plugin Adapter
 * 
 * Translates Graphify persistent graph nodes and edges (`graphify-out/graph.json`)
 * into SecB `KnowledgeClaim` objects for ingestion into SecB's KnowledgeLedger.
 */

import { readFileSync, existsSync } from "node:fs";

export class GraphifyAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GraphifyAdapterError";
    this.code = code;
  }
}

/**
 * Ingest a graph.json file produced by Graphify and extract SecB KnowledgeClaims.
 *
 * @param {string} graphJsonPath - Absolute path to graphify-out/graph.json
 * @param {object} [opts]
 * @param {string} [opts.project_id="SECB"]
 * @returns {Array<object>} List of valid KnowledgeClaim candidates
 */
export function parseGraphifyKnowledgeClaims(graphJsonPath, { project_id = "SECB" } = {}) {
  if (!existsSync(graphJsonPath)) {
    throw new GraphifyAdapterError("GRAPH_FILE_NOT_FOUND", `Graphify output not found at: ${graphJsonPath}`);
  }

  const raw = JSON.parse(readFileSync(graphJsonPath, "utf8"));
  const claims = [];

  const nodes = raw.nodes ?? raw.elements?.nodes ?? [];
  const links = raw.links ?? raw.edges ?? raw.elements?.edges ?? [];

  for (const node of nodes) {
    const nodeData = node.data ?? node;
    claims.push({
      schema_version: "1.0",
      claim_id: `KCLAIM-GRAPHIFY-NODE-${nodeData.id ?? nodeData.name}`,
      project_id,
      subject: String(nodeData.label ?? nodeData.name ?? nodeData.id),
      predicate: "has_symbol_type",
      object: String(nodeData.type ?? nodeData.community ?? "code_element"),
      evidence_refs: [String(nodeData.file_path ?? nodeData.source ?? "repository")],
      verification_status: "VERIFIED"
    });
  }

  for (const link of links) {
    const linkData = link.data ?? link;
    claims.push({
      schema_version: "1.0",
      claim_id: `KCLAIM-GRAPHIFY-EDGE-${linkData.source}-${linkData.target}`,
      project_id,
      subject: String(linkData.source),
      predicate: String(linkData.relationship ?? linkData.label ?? "depends_on"),
      object: String(linkData.target),
      evidence_refs: ["graphify-out/graph.json"],
      verification_status: "VERIFIED"
    });
  }

  return claims;
}
