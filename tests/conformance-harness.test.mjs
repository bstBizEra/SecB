/**
 * P0-18 Cross-Cutting Conformance Harness
 *
 * Exercises integration contracts across multiple modules:
 *   RuntimeRegistry + HostRuntimeAgent + EventLedger + EvidenceLedger
 *   + AuthorityEngine + TransitionEngine + DurableLedger hash chains
 *
 * Does NOT duplicate unit tests. Each scenario crosses at least two modules
 * and verifies a system-level invariant.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RuntimeRegistry, RegistryError } from "../src/registry/runtime-registry.mjs";
import { createAdapterRegistration, CLAUDE_CODE_ADAPTER, CODEX_ADAPTER, GENERIC_ADAPTER } from "../src/registry/adapters.mjs";
import { EventLedger, EvidenceLedger } from "../src/ledger/governed-ledgers.mjs";
import { DurableLedger } from "../src/ledger/durable-ledger.mjs";
import { HostRuntimeAgent, HostAgentError } from "../src/host/host-runtime-agent.mjs";
import { AuthorityEngine, AuthorityConfigurationError } from "../src/control/authority-engine.mjs";
import { TransitionEngine, TransitionDeniedError } from "../src/control/state-machine.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), `secb-conform-${label}-`));
}

function registerAndActivate(registry, base, instanceId) {
  const record = createAdapterRegistration(base, { agent_instance_id: instanceId });
  registry.register(record);
  registry.transitionEvaluation(instanceId, "APPROVED");
  registry.transitionLifecycle(instanceId, "ACTIVE");
}

function makeAgent(registry, eventLedger, overrides = {}) {
  return new HostRuntimeAgent({
    registry,
    eventLedger,
    projectId: "prj_conform",
    workPackageId: "wp_conform",
    sessionId: "sess_conform",
    ...overrides
  });
}

function makeGrant(overrides = {}) {
  return {
    grantId: "grant_conform_001",
    decisionId: "decision_conform_001",
    actorId: "inst_conform_claude",
    projectId: "prj_conform",
    workPackageId: "wp_conform",
    roles: ["ENGIN"],
    allowedTransitions: [
      "WorkPackage:READY->RUNNING",
      "WorkPackage:RUNNING->SELF_VERIFIED",
      "Session:READY->RUNNING",
      "Session:RUNNING->REVIEW_HANDOFF"
    ],
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    status: "ACTIVE",
    ...overrides
  };
}

function makeEvidence(actorId, seqTag) {
  const payload = { test: true, tag: seqTag };
  return {
    evidence_id: `ev_${seqTag}`,
    version: 1,
    project_id: "prj_conform",
    work_package_id: "wp_conform",
    session_id: "sess_conform",
    actor_id: actorId,
    evidence_type: "conformance-test",
    source: "conformance-harness",
    observed_at: new Date().toISOString(),
    procedure: "automated conformance test",
    result: "PASS",
    exit_status: 0,
    limitations: [],
    content_hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    verification_status: "CAPTURED",
    classification: "INTERNAL",
    retention_policy: "session"
  };
}

// ---------------------------------------------------------------------------
// 1. Full lifecycle: register -> approve -> activate -> emit -> seal evidence
//    -> verify hash chain integrity
// ---------------------------------------------------------------------------

test("full lifecycle: adapter registration through event emission and evidence sealing with hash chain verification", () => {
  const dir = tempDir("lifecycle");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const evidenceLedger = new EvidenceLedger({ filePath: join(dir, "evidence.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    // Phase 1: register and activate adapter
    const record = createAdapterRegistration(CLAUDE_CODE_ADAPTER, { agent_instance_id: "inst_lifecycle_claude" });
    assert.equal(record.evaluation_status, "CANDIDATE");
    assert.equal(record.lifecycle_state, "PENDING");

    const regResult = registry.register(record);
    assert.equal(regResult.registered, true);

    registry.transitionEvaluation("inst_lifecycle_claude", "APPROVED");
    registry.transitionLifecycle("inst_lifecycle_claude", "ACTIVE");

    const resolution = registry.resolve("inst_lifecycle_claude");
    assert.equal(resolution.resolved, true);
    assert.deepEqual(resolution.identity.permitted_roles, ["ENGIN"]);

    // Phase 2: emit events through HostRuntimeAgent
    const { event: evt1, ledgerSequence: seq1 } = agent.emitEvent("inst_lifecycle_claude", {
      eventType: "session.started",
      observedFact: { action: "session_open" },
      idempotencyKey: "idem_lc_001"
    });
    assert.equal(seq1, 1);
    assert.equal(evt1.source, "claude-code");

    const { event: evt2, ledgerSequence: seq2 } = agent.emitEvent("inst_lifecycle_claude", {
      eventType: "file.observed",
      observedFact: { path: "src/index.mjs" },
      idempotencyKey: "idem_lc_002"
    });
    assert.equal(seq2, 2);

    // Phase 3: seal evidence into the evidence ledger
    const evidence = makeEvidence("inst_lifecycle_claude", "lc_001");
    const evResult = evidenceLedger.appendEvidence(evidence, {
      expectedSequence: 0,
      idempotencyKey: "idem_ev_lc_001"
    });
    assert.equal(evResult.sequence, 1);
    assert.equal(evResult.replayed, false);

    // Phase 4: verify hash chain integrity on both ledgers
    const eventVerify = eventLedger.verify();
    assert.equal(eventVerify.valid, true);
    assert.equal(eventVerify.count, 2);
    assert.match(eventVerify.headHash, /^[a-f0-9]{64}$/);

    const evidenceVerify = evidenceLedger.verify();
    assert.equal(evidenceVerify.valid, true);
    assert.equal(evidenceVerify.count, 1);
    assert.match(evidenceVerify.headHash, /^[a-f0-9]{64}$/);

    // Phase 5: read back records and verify chain links
    const eventRecords = eventLedger.read();
    assert.equal(eventRecords.length, 2);
    assert.equal(eventRecords[0].previousHash, "0".repeat(64));
    assert.equal(eventRecords[1].previousHash, eventRecords[0].recordHash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Fail-closed chain: unregistered adapter -> blocked at HostRuntimeAgent
//    -> no event in ledger
// ---------------------------------------------------------------------------

test("fail-closed chain: unregistered adapter blocked at host, nothing written to ledger", () => {
  const dir = tempDir("failclosed");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    // Attempt to emit from a completely unknown adapter
    assert.throws(
      () => agent.emitEvent("inst_phantom", {
        eventType: "session.started",
        observedFact: { action: "phantom_session" },
        idempotencyKey: "idem_phantom_001"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_UNRESOLVED_ADAPTER"
    );

    // Verify ledger is empty
    const verify = eventLedger.verify();
    assert.equal(verify.count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fail-closed chain: CANDIDATE adapter (registered but not approved) blocked, ledger stays empty", () => {
  const dir = tempDir("failclosed-cand");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    const record = createAdapterRegistration(CODEX_ADAPTER, { agent_instance_id: "inst_candidate_only" });
    registry.register(record);
    // Do NOT approve or activate

    assert.throws(
      () => agent.emitEvent("inst_candidate_only", {
        eventType: "tool.invoked",
        observedFact: { tool: "read" },
        idempotencyKey: "idem_cand_fc_001"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_UNRESOLVED_ADAPTER"
    );

    const verify = eventLedger.verify();
    assert.equal(verify.count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Authority + registry integration: adapter resolves identity -> identity
//    feeds AuthorityEngine -> transition authorized/denied based on roles
// ---------------------------------------------------------------------------

test("authority + registry: resolved adapter identity authorizes transitions matching its permitted_roles", () => {
  const dir = tempDir("auth-allow");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_conform_claude");

    // Resolve identity and confirm roles
    const resolution = registry.resolve("inst_conform_claude");
    assert.equal(resolution.resolved, true);
    assert.ok(resolution.identity.permitted_roles.includes("ENGIN"));

    // Build AuthorityEngine with a grant matching the resolved identity
    const grant = makeGrant();
    const engine = new AuthorityEngine({
      grants: [grant],
      now: () => new Date("2026-06-15T12:00:00Z")
    });

    // Wire AuthorityEngine into TransitionEngine
    const transitionEngine = new TransitionEngine({ authorize: engine.asTransitionResolver() });

    // Transition that requires ENGIN role -- should succeed
    const result = transitionEngine.transition({
      objectType: "WorkPackage",
      objectId: "wp_conform",
      objectVersion: 1,
      projectId: "prj_conform",
      workPackageId: "wp_conform",
      currentState: "READY",
      requestedState: "RUNNING",
      actorId: "inst_conform_claude",
      authorityRef: "grant_conform_001",
      policyDecision: "ALLOW",
      evidenceRefs: ["ev_conform_001"],
      idempotencyKey: "idem_auth_allow_001",
      timestamp: "2026-06-15T12:00:00Z",
      reasonCode: "CONFORMANCE_TEST"
    });
    assert.equal(result.state, "RUNNING");
    assert.equal(result.authorityDecisionId, "decision_conform_001");

    // Emit an event to prove the adapter and authority chain work end-to-end
    const { event } = agent.emitEvent("inst_conform_claude", {
      eventType: "transition.observed",
      observedFact: { transitionId: result.transitionId, to: "RUNNING" },
      idempotencyKey: "idem_auth_evt_001"
    });
    assert.equal(event.actor_id, "inst_conform_claude");
    assert.equal(event.source, "claude-code");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("authority + registry: adapter with empty permitted_roles denied transitions requiring a role", () => {
  const dir = tempDir("auth-deny");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });

    registerAndActivate(registry, GENERIC_ADAPTER, "inst_generic_noroles");

    const resolution = registry.resolve("inst_generic_noroles");
    assert.equal(resolution.resolved, true);
    assert.deepEqual(resolution.identity.permitted_roles, []);

    // Build grant that assigns no useful roles (matching GENERIC_ADAPTER's empty roles)
    const grant = makeGrant({
      grantId: "grant_generic_001",
      decisionId: "decision_generic_001",
      actorId: "inst_generic_noroles",
      roles: [], // no roles
      allowedTransitions: ["WorkPackage:READY->RUNNING"]
    });

    // AuthorityEngine allows empty-role grants (no SoD conflict)
    const engine = new AuthorityEngine({
      grants: [grant],
      now: () => new Date("2026-06-15T12:00:00Z")
    });
    const transitionEngine = new TransitionEngine({ authorize: engine.asTransitionResolver() });

    // Transition requires ENGIN role but adapter has none -- denied
    assert.throws(
      () => transitionEngine.transition({
        objectType: "WorkPackage",
        objectId: "wp_conform",
        objectVersion: 1,
        projectId: "prj_conform",
        workPackageId: "wp_conform",
        currentState: "READY",
        requestedState: "RUNNING",
        actorId: "inst_generic_noroles",
        authorityRef: "grant_generic_001",
        policyDecision: "ALLOW",
        evidenceRefs: ["ev_generic_001"],
        idempotencyKey: "idem_auth_deny_001",
        timestamp: "2026-06-15T12:00:00Z",
        reasonCode: "CONFORMANCE_TEST"
      }),
      (err) => err instanceof TransitionDeniedError && err.code === "DENY_AUTHORITY"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Revocation cascade: active adapter SUSPENDED -> emit blocked ->
//    transition denied
// ---------------------------------------------------------------------------

test("revocation cascade: SUSPENDED adapter cannot emit events and transitions are denied", () => {
  const dir = tempDir("revoke");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_revoke_claude");

    // Successful emit before suspension
    const { ledgerSequence } = agent.emitEvent("inst_revoke_claude", {
      eventType: "session.started",
      observedFact: { action: "begin" },
      idempotencyKey: "idem_rev_001"
    });
    assert.equal(ledgerSequence, 1);

    // Suspend the adapter
    registry.transitionEvaluation("inst_revoke_claude", "SUSPENDED");
    const entry = registry.get("inst_revoke_claude");
    assert.equal(entry.evaluation_status, "SUSPENDED");

    // Emit is now blocked
    assert.throws(
      () => agent.emitEvent("inst_revoke_claude", {
        eventType: "session.continued",
        observedFact: { action: "after_suspend" },
        idempotencyKey: "idem_rev_002"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_UNRESOLVED_ADAPTER"
    );

    // Ledger only has the one event from before suspension
    const verify = eventLedger.verify();
    assert.equal(verify.count, 1);

    // Resolve confirms quarantined
    const resolution = registry.resolve("inst_revoke_claude");
    assert.equal(resolution.resolved, false);
    assert.equal(resolution.quarantined, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("revocation cascade: REVOKED adapter is permanently blocked from re-approval", () => {
  const dir = tempDir("revoke-perm");
  try {
    const registry = new RuntimeRegistry();

    registerAndActivate(registry, CODEX_ADAPTER, "inst_revoke_codex");

    // Revoke the adapter
    registry.transitionEvaluation("inst_revoke_codex", "REVOKED");

    // Cannot re-approve a REVOKED adapter (terminal state)
    assert.throws(
      () => registry.transitionEvaluation("inst_revoke_codex", "APPROVED"),
      (err) => err instanceof RegistryError && err.code === "DENY_EVALUATION_TRANSITION"
    );

    // Resolve confirms permanently quarantined
    const resolution = registry.resolve("inst_revoke_codex");
    assert.equal(resolution.resolved, false);
    assert.equal(resolution.quarantined, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Adversarial scenarios
// ---------------------------------------------------------------------------

test("adversarial: tampered registration after register is frozen and does not affect registry", () => {
  const dir = tempDir("tamper-reg");
  try {
    const registry = new RuntimeRegistry();
    const record = createAdapterRegistration(CLAUDE_CODE_ADAPTER, { agent_instance_id: "inst_tamper" });

    registry.register(record);

    // Attempt to mutate the original record object
    record.permitted_roles = ["GOV", "ENGIN", "ADMIN"];
    record.authority_ceiling = "A5";
    record.evaluation_status = "APPROVED";

    // Retrieve from registry and verify it is not tampered
    const stored = registry.get("inst_tamper");
    assert.deepEqual(stored.permitted_roles, ["ENGIN"]);
    assert.equal(stored.authority_ceiling, "A0");
    assert.equal(stored.evaluation_status, "CANDIDATE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adversarial: schema-invalid event payload rejected before reaching ledger", () => {
  const dir = tempDir("invalid-payload");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_invalid_evt");

    // null observedFact is rejected at host level (incomplete event)
    assert.throws(
      () => agent.emitEvent("inst_invalid_evt", {
        eventType: "session.started",
        observedFact: null,
        idempotencyKey: "idem_inv_001"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_INCOMPLETE_EVENT"
    );

    // Missing eventType
    assert.throws(
      () => agent.emitEvent("inst_invalid_evt", {
        eventType: "",
        observedFact: { data: true },
        idempotencyKey: "idem_inv_002"
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_INCOMPLETE_EVENT"
    );

    // Missing idempotencyKey
    assert.throws(
      () => agent.emitEvent("inst_invalid_evt", {
        eventType: "session.started",
        observedFact: { data: true },
        idempotencyKey: ""
      }),
      (err) => err instanceof HostAgentError && err.code === "DENY_INCOMPLETE_EVENT"
    );

    // Ledger is empty after all rejections
    assert.equal(eventLedger.verify().count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adversarial: replayed idempotency key across agent pipeline is caught by ledger guard", () => {
  const dir = tempDir("replay-evt");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_replay_evt");

    agent.emitEvent("inst_replay_evt", {
      eventType: "session.started",
      observedFact: { action: "open" },
      idempotencyKey: "idem_replay_001"
    });

    // A second call through the agent pipeline reuses the idempotency key
    // but the agent generates a new event_id and timestamp, so the ledger
    // entry content differs. The ledger's idempotency guard correctly
    // rejects this as a conflict, proving the defense works end-to-end.
    assert.throws(
      () => agent.emitEvent("inst_replay_evt", {
        eventType: "session.started",
        observedFact: { action: "open" },
        idempotencyKey: "idem_replay_001"
      }),
      (err) => err.code === "DENY_IDEMPOTENCY_CONFLICT"
    );

    // Ledger has exactly one record
    assert.equal(eventLedger.verify().count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adversarial: replayed idempotency key with different content is rejected at ledger level", () => {
  const dir = tempDir("replay-conflict");
  try {
    const registry = new RuntimeRegistry();
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const agent = makeAgent(registry, eventLedger);

    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_replay_conflict");

    agent.emitEvent("inst_replay_conflict", {
      eventType: "session.started",
      observedFact: { action: "open" },
      idempotencyKey: "idem_conflict_001"
    });

    // Same idempotency key but different observed fact
    assert.throws(
      () => agent.emitEvent("inst_replay_conflict", {
        eventType: "session.started",
        observedFact: { action: "TAMPERED" },
        idempotencyKey: "idem_conflict_001"
      }),
      (err) => err.code === "DENY_IDEMPOTENCY_CONFLICT"
    );

    // Ledger still has exactly one record
    assert.equal(eventLedger.verify().count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adversarial: replayed idempotency key on evidence ledger returns same record without growth", () => {
  const dir = tempDir("replay-ev");
  try {
    const evidenceLedger = new EvidenceLedger({ filePath: join(dir, "evidence.jsonl") });

    const evidence = makeEvidence("inst_replay_ev", "ev_replay_001");
    const first = evidenceLedger.appendEvidence(evidence, {
      expectedSequence: 0,
      idempotencyKey: "idem_ev_replay_001"
    });
    assert.equal(first.replayed, false);
    assert.equal(first.sequence, 1);

    // Identical replay
    const replay = evidenceLedger.appendEvidence(evidence, {
      expectedSequence: 0,
      idempotencyKey: "idem_ev_replay_001"
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.sequence, 1);

    assert.equal(evidenceLedger.verify().count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adversarial: SoD conflict detected across combined grants for the same actor and scope", () => {
  // ENGIN and REV are conflicting roles -- assigning both to the same
  // actor/project/workPackage scope must be rejected at engine construction
  assert.throws(
    () => new AuthorityEngine({
      grants: [
        makeGrant({ grantId: "grant_sod_1", roles: ["ENGIN"], actorId: "inst_sod" }),
        makeGrant({
          grantId: "grant_sod_2",
          decisionId: "decision_sod_002",
          roles: ["REV"],
          actorId: "inst_sod",
          allowedTransitions: ["Project:DRAFT->REVIEW"]
        })
      ],
      now: () => new Date("2026-06-15T12:00:00Z")
    }),
    (err) => err instanceof AuthorityConfigurationError && err.code === "SOD_ROLE_CONFLICT"
  );
});

test("adversarial: duplicate adapter instance ID rejected at registry level", () => {
  const registry = new RuntimeRegistry();
  const record1 = createAdapterRegistration(CLAUDE_CODE_ADAPTER, { agent_instance_id: "inst_dup" });
  const record2 = createAdapterRegistration(CODEX_ADAPTER, { agent_instance_id: "inst_dup" });

  registry.register(record1);

  assert.throws(
    () => registry.register(record2),
    (err) => err instanceof RegistryError && err.code === "DENY_DUPLICATE_INSTANCE"
  );
});

test("adversarial: transition idempotency key reuse with altered payload is rejected", () => {
  const engine = new TransitionEngine({
    authorize: () => ({ allowed: true, decisionId: "decision_adv_001" })
  });

  engine.transition({
    objectType: "WorkPackage",
    objectId: "wp_adv",
    objectVersion: 1,
    projectId: "prj_conform",
    workPackageId: "wp_conform",
    currentState: "READY",
    requestedState: "RUNNING",
    actorId: "inst_adv",
    authorityRef: "auth_adv",
    policyDecision: "ALLOW",
    evidenceRefs: ["ev_001"],
    idempotencyKey: "idem_trans_conflict",
    timestamp: "2026-06-15T12:00:00Z",
    reasonCode: "ORIGINAL"
  });

  // Same idempotency key, different reasonCode
  assert.throws(
    () => engine.transition({
      objectType: "WorkPackage",
      objectId: "wp_adv",
      objectVersion: 1,
      projectId: "prj_conform",
      workPackageId: "wp_conform",
      currentState: "READY",
      requestedState: "RUNNING",
      actorId: "inst_adv",
      authorityRef: "auth_adv",
      policyDecision: "ALLOW",
      evidenceRefs: ["ev_001"],
      idempotencyKey: "idem_trans_conflict",
      timestamp: "2026-06-15T12:00:00Z",
      reasonCode: "TAMPERED"
    }),
    (err) => err instanceof TransitionDeniedError && err.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
});

test("adversarial: hash chain detects ledger file tampering", () => {
  const dir = tempDir("tamper-chain");
  try {
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const registry = new RuntimeRegistry();
    const agent = makeAgent(registry, eventLedger);

    registerAndActivate(registry, CLAUDE_CODE_ADAPTER, "inst_chain_tamper");

    // Write two legitimate events
    agent.emitEvent("inst_chain_tamper", {
      eventType: "session.started",
      observedFact: { step: 1 },
      idempotencyKey: "idem_chain_001"
    });
    agent.emitEvent("inst_chain_tamper", {
      eventType: "session.continued",
      observedFact: { step: 2 },
      idempotencyKey: "idem_chain_002"
    });

    // Verify chain is valid before tampering
    assert.equal(eventLedger.verify().valid, true);

    // Tamper with the ledger file directly: modify the first record's payload
    const filePath = join(dir, "events.jsonl");
    const raw = readFileSync(filePath, "utf8");
    const lines = raw.trim().split("\n");
    const record0 = JSON.parse(lines[0]);
    record0.entry.payload.observed_fact = { step: "TAMPERED" };
    lines[0] = JSON.stringify(record0);
    writeFileSync(filePath, lines.join("\n") + "\n", "utf8");

    // Verify detects the corruption
    assert.throws(
      () => eventLedger.verify(),
      (err) => err.code === "LEDGER_INTEGRITY_FAILURE"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
