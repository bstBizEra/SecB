/**
 * SecB Knowledge Graph Data Issues Detector Unit Tests
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { detectKnowledgeGraphIssues } from "../src/plugins/secb-graph-issue-detector.mjs";

test("AC-GRAPH-ISSUE-01: detectKnowledgeGraphIssues finds isolated nodes and duplicate labels", () => {
  const nodes = [
    { id: "node_1", name: "AuthorityEngine" },
    { id: "node_2", name: "AuthorityEngine" }, // Duplicate label
    { id: "orphan_1", name: "UnusedScript" }    // Isolated node (degree 0)
  ];

  const edges = [
    { source: "node_1", target: "node_2" },
    { source: "node_1", target: "missing_target" } // Invalid edge endpoint
  ];

  const issues = detectKnowledgeGraphIssues(nodes, edges);
  assert.ok(issues.length >= 3);

  const iso = issues.find(i => i.type === "ISOLATED_NODE");
  assert.ok(iso);
  assert.equal(iso.affectedNodeIds[0], "orphan_1");

  const dup = issues.find(i => i.type === "DUPLICATED_NODE");
  assert.ok(dup);

  const inv = issues.find(i => i.type === "INVALID_EDGE");
  assert.ok(inv);
});
