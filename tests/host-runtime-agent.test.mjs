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

test("emitted event passes eventEnvelope schema validation", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_schema_check");
    const { event } = agent.emitEvent("inst_schema_check", {
      eventType: "file.observed",
      observedFact: { path: "src/index.mjs" },
      idempotencyKey: "idem_schema_001"
    });
    assert.ok(event.event_id);
    assert.ok(event.content_hash);
    assert.equal(event.version, 1);
    assert.match(event.occurred_at, /^\d{4}-\d{2}-\d{2}T/);
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

// ---------------------------------------------------------------------------
// DENY_INVALID_EVENT, and the sequence number a rejected event must not consume.
//
// emitEvent builds the envelope itself, so most fields cannot be made invalid
// from outside. What a caller controls is observedFact, eventType and
// classification — and the guard above the schema check is only `!observedFact`,
// so a truthy value of the wrong TYPE passes it and is caught by the schema.
//
// The property worth pinning is the line right before the throw: `#sequence--`.
// Event ids are `evt_<session>_<n>`, and the ledger append asserts
// expectedSequence, so a rejected event that consumed a number would leave a
// permanent gap and desynchronise every subsequent append from the ledger.
// ---------------------------------------------------------------------------

test("DENY_INVALID_EVENT — a caller-supplied field that fails the envelope schema", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_schema");
    // observed_fact is declared `type: object`. A non-blank string passes the
    // `!observedFact` guard and reaches the schema — which is the whole point of
    // having both checks.
    for (const observedFact of ["a string", 42, true]) {
      assert.throws(
        () => agent.emitEvent("inst_schema", {
          eventType: "session.started",
          observedFact,
          idempotencyKey: "idem_schema"
        }),
        (error) => {
          assert.ok(error instanceof HostAgentError, `${String(observedFact)}: wrong error class`);
          assert.equal(error.code, "DENY_INVALID_EVENT", `${String(observedFact)}: wrong code`);
          return true;
        }
      );
    }

    // DISTINCT FROM DENY_INCOMPLETE_EVENT, which is the guard above it. A falsy
    // observedFact never reaches the schema at all, and reporting the two as one
    // would hide which check actually fired.
    assert.throws(
      () => agent.emitEvent("inst_schema", {
        eventType: "session.started",
        observedFact: null,
        idempotencyKey: "idem_schema"
      }),
      (error) => error.code === "DENY_INCOMPLETE_EVENT"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a rejected event does not consume a sequence number", () => {
  const { dir, registry, agent } = setup();
  try {
    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_seq");
    const emit = (observedFact, idempotencyKey) => agent.emitEvent("inst_seq", {
      eventType: "session.started", observedFact, idempotencyKey
    });

    const first = emit({ action: "one" }, "idem_seq_1");
    assert.equal(first.event.event_id, "evt_sess_test_1");
    assert.equal(first.ledgerSequence, 1);

    // Rejected: the counter was incremented while building the envelope and must
    // be put back.
    assert.throws(() => emit("not an object", "idem_seq_bad"), (e) => e.code === "DENY_INVALID_EVENT");

    // THE ASSERTION THAT MATTERS. If the decrement were dropped, this id would
    // be evt_sess_test_3 and the ledger's expectedSequence would no longer line
    // up — a gap that nothing else in the suite would notice, because every
    // other test emits only valid events.
    const second = emit({ action: "two" }, "idem_seq_2");
    assert.equal(second.event.event_id, "evt_sess_test_2");
    assert.equal(second.ledgerSequence, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
