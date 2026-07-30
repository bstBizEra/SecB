import { test } from "node:test";
import assert from "node:assert/strict";
import { CrossProjectKnowledgeService } from "../src/services/cross-project-knowledge.mjs";
import { SwarmDelegationService, SwarmDelegationError } from "../src/services/swarm-delegation-service.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("CrossProjectKnowledgeService synthesizes context receipts across project boundaries", () => {
  const service = new CrossProjectKnowledgeService();
  const res = service.synthesizeProjectKnowledge({ projectId: "SECB-KNOW-01" });

  assert.equal(res.ok, true);
  assert.equal(res.project_id, "SECB-KNOW-01");
  assert.ok(res.receipt_id.startsWith("RECEIPT-KNOW-SECB-KNOW-01-"));
  assert.equal(typeof res.fingerprint, "string");
  assert.equal(res.fingerprint.length, 64);
  assert.equal(res.claim.provenance, "SecB Knowledge Synthesis");
});

test("SwarmDelegationService delegates subagent task and mints handoff envelope", () => {
  const service = new SwarmDelegationService();
  const delegation = service.delegateTask({
    parentAgentId: "agent-producer-01",
    subagentId: "agent-reviewer-02",
    taskId: "TASK-SWARM-99",
    role: "code_reviewer",
    payload: { targetFile: "src/index.mjs" }
  });

  assert.equal(delegation.parent_agent_id, "agent-producer-01");
  assert.equal(delegation.subagent_id, "agent-reviewer-02");
  assert.equal(delegation.status, "DELEGATED");
  assert.equal(delegation.fingerprint.length, 64);
  assert.equal(delegation.handoff_envelope.producer_agent, "agent-producer-01");
});

test("SwarmDelegationService denies Maker-Checker SoD self-delegation", () => {
  const service = new SwarmDelegationService();
  assert.throws(
    () =>
      service.delegateTask({
        parentAgentId: "agent-producer-01",
        subagentId: "agent-producer-01",
        taskId: "TASK-SWARM-100"
      }),
    (err) => err instanceof SwarmDelegationError && err.code === "DENY_SOD_SELF_DELEGATION"
  );
});

test("SwarmDelegationService verifies delegation chain integrity and SoD compliance", () => {
  const service = new SwarmDelegationService();
  const delegation = service.delegateTask({
    parentAgentId: "agent-lead",
    subagentId: "agent-worker",
    taskId: "TASK-SWARM-101"
  });

  const verified = service.verifyDelegationChain(delegation.delegation_id);
  assert.equal(verified.ok, true);
  assert.equal(verified.integrity_verified, true);
  assert.equal(verified.sod_compliant, true);
});

test("SecBMcpServer dispatches secb_knowledge_cross_project_synthesize and secb_swarm_delegation_verify", () => {
  const knowService = new CrossProjectKnowledgeService();
  const swarmService = new SwarmDelegationService();

  const delegation = swarmService.delegateTask({
    parentAgentId: "agent-lead-mcp",
    subagentId: "agent-worker-mcp",
    taskId: "TASK-MCP-99"
  });

  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, crossProjectKnowledgeService: knowService, swarmDelegationService: swarmService },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const knowRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 200,
      method: "tools/call",
      params: {
        name: "secb_knowledge_cross_project_synthesize",
        arguments: { projectId: "PROJ-MCP-KNOW" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(knowRes.id, 200);
  assert.equal(knowRes.result.data.project_id, "PROJ-MCP-KNOW");

  const swarmRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 201,
      method: "tools/call",
      params: {
        name: "secb_swarm_delegation_verify",
        arguments: { delegation_id: delegation.delegation_id }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(swarmRes.id, 201);
  assert.equal(swarmRes.result.data.integrity_verified, true);
  assert.equal(swarmRes.result.data.sod_compliant, true);
});
