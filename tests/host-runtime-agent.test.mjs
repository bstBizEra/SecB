import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RuntimeRegistry } from "../src/registry/runtime-registry.mjs";
import { createAdapterRegistration, CLAUDE_CODE_ADAPTER, GENERIC_ADAPTER } from "../src/registry/adapters.mjs";
import { EventLedger } from "../src/ledger/governed-ledgers.mjs";
import { HostRuntimeAgent, HostAgentError } from "../src/host/host-runtime-agent.mjs";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "secb-host-test-"));
  const ledgerPath = join(dir, "events.jsonl");
  const registry = new RuntimeRegistry();
  const eventLedger = new EventLedger({ filePath: ledgerPath });
  const agent = new HostRuntimeAgent({
    registry,
    eventLedger,
    projectId: "prj_test",
    workPackageId: "wp_test",
    sessionId: "sess_test"
  });
  return { dir, registry, eventLedger, agent };
}

function registerAndActivate(registry, base, instanceId) {
  const record = createAdapterRegistration(base, { agent_instance_id: instanceId });
  registry.register(record);
  registry.transitionEvaluation(instanceId, "APPROVED");
  registry.transitionLifecycle(instanceId, "ACTIVE");
}

test("V-019 end-to-end positive: approved adapter emits a normalized event", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_e2e_claude");
    const { event, ledgerSequence } = agent.emitEvent("inst_e2e_claude", {
      eventType: "session.started",
      observedFact: { action: "session_open" },
      idempotencyKey: "idem_001"
    });
    assert.equal(event.project_id, "prj_test");
    assert.equal(event.work_package_id, "wp_test");
    assert.equal(event.session_id, "sess_test");
    assert.equal(event.actor_id, "inst_e2e_claude");
    assert.equal(event.event_type, "session.started");
    assert.equal(event.source, "claude-code");
    assert.equal(event.classification, "INTERNAL");
    assert.match(event.content_hash, /^[a-f0-9]{64}$/);
    assert.equal(ledgerSequence, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("V-019 end-to-end negative: unregistered adapter cannot emit events", () => {
  const { dir, agent } = setup();
  try {
    assert.throws(
      () => agent.emitEvent("inst_ghost", {
        eventType: "session.started",
        observedFact: { action: "session_open" },
        idempotencyKey: "idem_ghost"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_UNRESOLVED_ADAPTER"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("V-019 end-to-end negative: CANDIDATE adapter cannot emit events", () => {
  const { dir, registry, agent } = setup();
  try {
    const record = createAdapterRegistration(CLAUDE_CODE_ADAPTER, { agent_instance_id: "inst_candidate" });
    registry.register(record);
    assert.throws(
      () => agent.emitEvent("inst_candidate", {
        eventType: "tool.invoked",
        observedFact: { tool: "read" },
        idempotencyKey: "idem_cand"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_UNRESOLVED_ADAPTER"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("observe produces a read-only domain observation event", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_observer");
    const { event } = agent.observe("inst_observer", {
      domain: "git",
      detail: { branch: "main", status: "clean" },
      idempotencyKey: "idem_git_001"
    });
    assert.equal(event.event_type, "git.observed");
    assert.deepEqual(event.observed_fact, {
      domain: "git",
      detail: { branch: "main", status: "clean" },
      read_only: true
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("multiple events produce sequential ledger entries", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_seq");
    const r1 = agent.emitEvent("inst_seq", {
      eventType: "file.observed",
      observedFact: { path: "src/index.mjs" },
      idempotencyKey: "idem_seq_1"
    });
    const r2 = agent.emitEvent("inst_seq", {
      eventType: "file.observed",
      observedFact: { path: "src/registry/runtime-registry.mjs" },
      idempotencyKey: "idem_seq_2"
    });
    assert.equal(r1.ledgerSequence, 1);
    assert.equal(r2.ledgerSequence, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing required event fields fail closed", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_missing");
    assert.throws(
      () => agent.emitEvent("inst_missing", {
        eventType: "session.started",
        observedFact: null,
        idempotencyKey: "idem_miss"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_INCOMPLETE_EVENT"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("constructor rejects missing dependencies", () => {
  assert.throws(
    () => new HostRuntimeAgent({ registry: null, eventLedger: null, projectId: "p", workPackageId: "w", sessionId: "s" }),
    (err) => err instanceof HostAgentError && err.code === "MISSING_REGISTRY"
  );
});

test("resolveAdapter returns quarantine status without emitting", () => {
  const { dir, registry, agent } = setup();
  try {
    const result = agent.resolveAdapter("inst_nonexistent");
    assert.equal(result.resolved, false);
    assert.equal(result.quarantined, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("suspended adapter is blocked from emitting after initial approval", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_suspend");
    agent.emitEvent("inst_suspend", {
      eventType: "session.started",
      observedFact: { ok: true },
      idempotencyKey: "idem_before_suspend"
    });
    registry.transitionEvaluation("inst_suspend", "SUSPENDED");
    assert.throws(
      () => agent.emitEvent("inst_suspend", {
        eventType: "session.continued",
        observedFact: { ok: false },
        idempotencyKey: "idem_after_suspend"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_UNRESOLVED_ADAPTER"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
