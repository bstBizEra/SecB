import { test } from "node:test";
import assert from "node:assert/strict";
import { SecBModuleRecommender, ModuleRecommenderError } from "../src/control/module-recommender.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("SecBModuleRecommender recommends project registration handoff for REGISTERED_PROPOSAL_ONLY", () => {
  const recommender = new SecBModuleRecommender();
  const rec = recommender.recommendNextAction({
    module: "project_registration",
    currentStatus: "REGISTERED_PROPOSAL_ONLY"
  });

  assert.equal(rec.module, "project_registration");
  assert.equal(rec.current_status, "REGISTERED_PROPOSAL_ONLY");
  assert.equal(rec.requires_human_gov, true);
  assert.equal(rec.risk_class, "R3");
  assert.ok(rec.recommended_option.includes("Human GOV"));
});

test("SecBModuleRecommender recommends bootstrap execution for AUTHORIZED_FOR_BOOTSTRAP", () => {
  const recommender = new SecBModuleRecommender();
  const rec = recommender.recommendNextAction({
    module: "project_registration",
    currentStatus: "AUTHORIZED_FOR_BOOTSTRAP"
  });

  assert.equal(rec.module, "project_registration");
  assert.equal(rec.current_status, "AUTHORIZED_FOR_BOOTSTRAP");
  assert.equal(rec.requires_human_gov, false);
  assert.equal(rec.next_action, "execute_bootstrap");
});

test("SecBModuleRecommender recommends work package review for DRAFT", () => {
  const recommender = new SecBModuleRecommender();
  const rec = recommender.recommendNextAction({
    module: "work_package",
    currentStatus: "DRAFT"
  });

  assert.equal(rec.module, "work_package");
  assert.equal(rec.next_action, "submit_review");
  assert.equal(rec.requires_human_gov, false);
});

test("SecBModuleRecommender throws error on unknown module", () => {
  const recommender = new SecBModuleRecommender();
  assert.throws(
    () => recommender.recommendNextAction({ module: "unknown_module" }),
    (err) => err instanceof ModuleRecommenderError && err.code === "UNKNOWN_MODULE"
  );
});

test("SecBMcpServer dispatches secb_module_recommend tool", () => {
  const recommender = new SecBModuleRecommender();
  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, moduleRecommender: recommender },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const res = server.handle(
    {
      jsonrpc: "2.0",
      id: 300,
      method: "tools/call",
      params: {
        name: "secb_module_recommend",
        arguments: { module: "project_registration", currentStatus: "REGISTERED_PROPOSAL_ONLY" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(res.id, 300);
  assert.equal(res.result.data.module, "project_registration");
  assert.equal(res.result.data.requires_human_gov, true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].tool, "secb_module_recommend");
});
