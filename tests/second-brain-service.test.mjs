import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAOrganizer } from "../src/brain/para-organizer.mjs";
import { SecondBrainService, SecondBrainServiceError } from "../src/brain/second-brain-service.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("PARAOrganizer categorizes and SHA-256 seals knowledge items", () => {
  const para = new PARAOrganizer();
  const item = para.organizeKnowledge({
    title: "Governance Baseline",
    content: "SecB governance baseline policy rules",
    category: "AREAS",
    classification: "INTERNAL"
  });

  assert.ok(item.item_id.startsWith("PARA-AREAS-"));
  assert.equal(item.category, "AREAS");
  assert.equal(typeof item.fingerprint, "string");
  assert.equal(item.fingerprint.length, 64);

  const summary = para.getSummary();
  assert.equal(summary.AREAS, 1);
  assert.equal(summary.total_items, 1);
});

test("SecondBrainService captures knowledge and queries with classification ceiling withholding", () => {
  const brain = new SecondBrainService();
  brain.captureKnowledge({
    title: "Public API Spec",
    content: "Open API endpoints",
    category: "RESOURCES",
    classification: "PUBLIC"
  });

  brain.captureKnowledge({
    title: "Confidential Security Credentials",
    content: "Internal admin key",
    category: "RESOURCES",
    classification: "CONFIDENTIAL"
  });

  // Query under INTERNAL classification ceiling (should withhold CONFIDENTIAL item)
  const internalRes = brain.queryBrain({ query: "", dataClassification: "INTERNAL" });
  assert.equal(internalRes.items_survived, 1);
  assert.equal(internalRes.compact_snippets[0].title, "Public API Spec");

  // Query under CONFIDENTIAL classification ceiling (should include CONFIDENTIAL item)
  const confRes = brain.queryBrain({ query: "", dataClassification: "CONFIDENTIAL" });
  assert.equal(confRes.items_survived, 2);
});

test("SecondBrainService distills skills for SkillsHub", () => {
  const brain = new SecondBrainService();
  const skillPkg = brain.distillSkill({
    name: "auto-refactor",
    description: "Automated code refactoring skill",
    content: "Step 1: Parse AST\nStep 2: Apply transform"
  });

  assert.equal(skillPkg.name, "auto-refactor");
  assert.equal(skillPkg.path, ".agents/skills/auto-refactor/SKILL.md");
  assert.ok(skillPkg.content.includes("Auto-Distilled Workflow"));

  const paraSummary = brain.inspectPARA();
  assert.equal(paraSummary.RESOURCES, 1);
});

test("SecBMcpServer dispatches secb_brain_query and secb_brain_inspect_para", () => {
  const brain = new SecondBrainService();
  brain.captureKnowledge({
    title: "Project Alpha Contract",
    content: "Approved contract for Alpha",
    category: "PROJECTS",
    classification: "INTERNAL"
  });

  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, secondBrainService: brain },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const queryRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 400,
      method: "tools/call",
      params: {
        name: "secb_brain_query",
        arguments: { category: "PROJECTS" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(queryRes.id, 400);
  assert.equal(queryRes.result.data.items_survived, 1);
  assert.equal(queryRes.result.data.compact_snippets[0].title, "Project Alpha Contract");

  const paraRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 401,
      method: "tools/call",
      params: {
        name: "secb_brain_inspect_para",
        arguments: {}
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(paraRes.id, 401);
  assert.equal(paraRes.result.data.PROJECTS, 1);
});
