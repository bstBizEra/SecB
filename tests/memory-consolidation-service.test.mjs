import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryConsolidationService, MemoryConsolidationError } from "../src/memory/memory-consolidation-service.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("MemoryConsolidationService consolidates short-term session logs into PARA memory", () => {
  const mcs = new MemoryConsolidationService();
  const res = mcs.consolidateSessionMemory({
    sessionId: "SESSION-999",
    sessionTrace: "Completed core auth feature implementation",
    category: "RESOURCES",
    classification: "INTERNAL"
  });

  assert.ok(res.consolidation_id.startsWith("MEM-CONS-SESSION-999-"));
  assert.equal(res.category, "RESOURCES");
  assert.equal(typeof res.fingerprint, "string");
  assert.equal(res.fingerprint.length, 64);

  const summary = mcs.inspectMemorySummary();
  assert.equal(summary.consolidations_count, 1);
  assert.equal(summary.para_memory.RESOURCES, 1);
});

test("MemoryConsolidationService throws error on missing parameters", () => {
  const mcs = new MemoryConsolidationService();
  assert.throws(
    () => mcs.consolidateSessionMemory({ sessionId: null }),
    (err) => err instanceof MemoryConsolidationError && err.code === "INVALID_CONSOLIDATION_PARAMS"
  );
});

test("SecBMcpServer dispatches secb_memory_consolidate_inspect tool", () => {
  const mcs = new MemoryConsolidationService();
  mcs.consolidateSessionMemory({
    sessionId: "SESSION-MCP-TEST",
    sessionTrace: "MCP session trace payload"
  });

  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, memoryConsolidationService: mcs },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const res = server.handle(
    {
      jsonrpc: "2.0",
      id: 900,
      method: "tools/call",
      params: {
        name: "secb_memory_consolidate_inspect",
        arguments: {}
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(res.id, 900);
  assert.equal(res.result.data.consolidations_count, 1);
  assert.equal(res.result.data.status, "HEALTHY");
});
