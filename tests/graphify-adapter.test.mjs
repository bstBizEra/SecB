/**
 * SecB Graphify Plugin Adapter Unit & Audit Tests
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseGraphifyKnowledgeClaims, auditProjectGraphifyAccess } from "../src/plugins/secb-graphify-adapter.mjs";

const tmpDir = resolve(import.meta.dirname, "tmp_graphify_audit");

test("AC-GRAPHIFY-01: parseGraphifyKnowledgeClaims extracts nodes and edges as KnowledgeClaims", () => {
  mkdirSync(tmpDir, { recursive: true });
  const graphJson = resolve(tmpDir, "graph.json");

  writeFileSync(graphJson, JSON.stringify({
    nodes: [
      { id: "AuthorityEngine", label: "AuthorityEngine", type: "class", file_path: "src/engine/authority.mjs" },
      { id: "WorkPackage", label: "WorkPackage", type: "contract", file_path: "contracts/work-package.schema.json" }
    ],
    links: [
      { source: "AuthorityEngine", target: "WorkPackage", relationship: "governs" }
    ]
  }));

  const claims = parseGraphifyKnowledgeClaims(graphJson, { project_id: "SECB" });
  assert.equal(claims.length, 3);

  const nodeClaim = claims.find(c => c.subject === "AuthorityEngine");
  assert.equal(nodeClaim.predicate, "has_symbol_type");
  assert.equal(nodeClaim.object, "class");

  const edgeClaim = claims.find(c => c.predicate === "governs");
  assert.equal(edgeClaim.subject, "AuthorityEngine");
  assert.equal(edgeClaim.object, "WorkPackage");

  rmSync(tmpDir, { recursive: true, force: true });
});

test("AC-GRAPHIFY-02: auditProjectGraphifyAccess audits external project directory and produces R0 containment receipt", () => {
  const projectPath = resolve(import.meta.dirname, "..");
  const audit = auditProjectGraphifyAccess(projectPath, { codeOnly: true });

  assert.equal(audit.read_only_access, true);
  assert.equal(audit.security_verdict, "PASS_R0_CONTAINED");
  assert.equal(audit.isolation_mode, "LOCAL_TREE_SITTER_OFFLINE");
  assert.ok(audit.nodes_found > 0);
  assert.ok(audit.edges_found > 0);
  assert.ok(audit.knowledge_claims_generated > 0);
});
