import { test } from "node:test";
import assert from "node:assert/strict";
import { KnowledgeMaturityPipeline, KnowledgeMaturityError } from "../src/brain/knowledge-maturity-pipeline.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("KnowledgeMaturityPipeline promotes Session Record through all 5 stages", () => {
  const pipeline = new KnowledgeMaturityPipeline();

  // Stage 1 -> Stage 2
  const p2 = pipeline.promoteSessionToEvidence({
    sessionId: "SESSION-101",
    sessionTrace: "Ran git diff & node test",
    testResults: { pass: 5, fail: 0 }
  });

  assert.equal(p2.stage_number, 2);
  assert.equal(p2.stage, "EVIDENCE_ENVELOPE");
  assert.ok(p2.evidence_envelope.fingerprint);

  // Stage 2 -> Stage 3
  const p3 = pipeline.deriveKnowledgeFromEvidence({
    pipelineId: p2.pipeline_id,
    claimSummary: "AST graph reduction verified",
    baseline: "main"
  });

  assert.equal(p3.stage_number, 3);
  assert.equal(p3.stage, "KNOWLEDGE_CLAIM");
  assert.ok(p3.knowledge_claim.fingerprint);

  // Stage 3 -> Stage 4
  const p4 = pipeline.synthesizeExperience({
    pipelineId: p2.pipeline_id,
    patternTitle: "Refactor Pattern Alpha",
    description: "Modular refactoring pattern for microservices"
  });

  assert.equal(p4.stage_number, 4);
  assert.equal(p4.stage, "EXPERIENCE_PATTERN");
  assert.ok(p4.experience_pattern.fingerprint);

  // Stage 4 -> Stage 5
  const p5 = pipeline.promoteExperienceToSkill({
    pipelineId: p2.pipeline_id,
    skillName: "refactor-pattern-alpha",
    description: "Automated refactoring skill"
  });

  assert.equal(p5.stage_number, 5);
  assert.equal(p5.stage, "GOVERNED_SKILL");
  assert.equal(p5.governed_skill.name, "refactor-pattern-alpha");
  assert.equal(p5.governed_skill.path, ".agents/skills/refactor-pattern-alpha/SKILL.md");
});

test("KnowledgeMaturityPipeline enforces stage transition rules", () => {
  const pipeline = new KnowledgeMaturityPipeline();
  assert.throws(
    () => pipeline.deriveKnowledgeFromEvidence({ pipelineId: "INVALID-ID" }),
    (err) => err instanceof KnowledgeMaturityError && err.code === "PIPELINE_NOT_FOUND"
  );
});

test("SecBMcpServer dispatches secb_brain_maturity_promote tool", () => {
  const pipeline = new KnowledgeMaturityPipeline();
  const pState = pipeline.promoteSessionToEvidence({
    sessionId: "SESSION-MCP-1",
    sessionTrace: "MCP test trace"
  });

  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, knowledgeMaturityPipeline: pipeline },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const res = server.handle(
    {
      jsonrpc: "2.0",
      id: 500,
      method: "tools/call",
      params: {
        name: "secb_brain_maturity_promote",
        arguments: { pipeline_id: pState.pipeline_id }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(res.id, 500);
  assert.equal(res.result.data.stage_number, 2);
  assert.equal(res.result.data.session_id, "SESSION-MCP-1");
});
