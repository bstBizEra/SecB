// The P0-12/P0-17 integration test wave-001 required: the full delivered
// chain HostRuntimeAgent -> schema validation -> EventLedger -> chain
// verify -> projection -> report, positive and tamper-negative.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CLAUDE_CODE_ADAPTER, createAdapterRegistration } from "../src/registry/adapters.mjs";
import { RuntimeRegistry } from "../src/registry/runtime-registry.mjs";
import { EventLedger, EvidenceLedger } from "../src/ledger/governed-ledgers.mjs";
import { HostRuntimeAgent } from "../src/host/host-runtime-agent.mjs";
import { generateReport, readReport } from "../src/ui/ops-report-generator.mjs";

test("P0-12/P0-17 integration: host observations flow through the ledger into a verified report", () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-p012-p017-"));
  try {
    const eventLedgerPath = join(dir, "events.ndjson");
    const evidenceLedgerPath = join(dir, "evidence.ndjson");
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: eventLedgerPath });
    new EvidenceLedger({ filePath: evidenceLedgerPath });
    const agent = new HostRuntimeAgent({
      registry, eventLedger,
      projectId: "prj_int", workPackageId: "wp_int", sessionId: "ses_int"
    });
    const record = createAdapterRegistration(CLAUDE_CODE_ADAPTER, { agent_instance_id: "inst_p017" });
    registry.register(record);
    registry.transitionEvaluation("inst_p017", "APPROVED");
    registry.transitionLifecycle("inst_p017", "ACTIVE");

    const emitted = [];
    for (const [index, eventType] of ["session.started", "tool.invoked", "session.completed"].entries()) {
      const { event } = agent.emitEvent("inst_p017", {
        eventType,
        observedFact: { step: index },
        idempotencyKey: `idem_int_${index}`
      });
      emitted.push(event.event_id);
    }

    const outPath = join(dir, "report.html");
    const before = createHash("sha256").update(readFileSync(eventLedgerPath)).digest("hex");
    const result = generateReport({
      eventLedgerPath, evidenceLedgerPath, outPath,
      now: () => new Date("2026-07-19T12:30:00Z")
    });
    assert.equal(result.ok, true);
    assert.equal(result.events.count, 3);
    assert.equal(result.events.headHash, eventLedger.verify().headHash);

    const html = readReport(outPath);
    for (const id of emitted) assert.ok(html.includes(id));
    // ledger order preserved in the rendered timeline
    assert.ok(html.indexOf(emitted[0]) < html.indexOf(emitted[1]) && html.indexOf(emitted[1]) < html.indexOf(emitted[2]));
    assert.equal(createHash("sha256").update(readFileSync(eventLedgerPath)).digest("hex"), before);

    // tamper-negative: a single flipped field yields the failure report
    writeFileSync(eventLedgerPath, readFileSync(eventLedgerPath, "utf8").replace('"step":1', '"step":9'), "utf8");
    const tampered = generateReport({
      eventLedgerPath, evidenceLedgerPath, outPath,
      now: () => new Date("2026-07-19T12:31:00Z")
    });
    assert.equal(tampered.ok, false);
    assert.equal(tampered.code, "LEDGER_INTEGRITY_FAILURE");
    assert.ok(!readReport(outPath).includes(emitted[0]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
