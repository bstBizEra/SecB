/**
 * P0-18 Conformance Harness — CANDIDATE (AMD-002 advise-and-proceed)
 *
 * This file converts V-item conformance stubs that were previously BLOCKED into
 * LIVE positive / negative / adversarial cases, because their dependency
 * primitives are now ratified on main @ 4abfff2:
 *
 *   V-002 Project scope        -> src/project/project-contract-service.mjs
 *   V-010 Terminal (observer)  -> src/live/access-mode-policy.mjs
 *   V-014 MCP (cred-bounded)   -> src/gateway/mcp-gateway-core.mjs
 *   V-016 Recovery (PARTIAL)   -> src/ledger/checkpoint-ledger.mjs
 *
 * Discipline (identical to the rest of the harness):
 *   - Composes the REAL ratified primitives READ-ONLY over fixtures. No primitive
 *     is modified (byte-identity guard at the bottom pins every composed module
 *     to its git blob hash at main @ 4abfff2).
 *   - Every negative asserts the SPECIFIC deny code the real primitive emits.
 *   - Every adversarial asserts fail-closed behaviour (escalation, prototype
 *     pollution, hostile getter, credential leakage, tamper detection).
 *
 * SCOPE HONESTY: this is a conformance-COVERAGE candidate. It does NOT render the
 * P0-20 governance verdict and is NOT P0-18 sign-off. The V-016 DRIFT half
 * (comparing a checkpoint's source-ledger sequence against the live head to deny
 * a drifted resume) is checkpoint-ledger non-goal #3 and remains an honest stub
 * in tests/conformance-stubs.test.mjs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  ProjectContractService,
  ProjectContractServiceError
} from "../src/project/project-contract-service.mjs";
import {
  evaluateAccessRequest,
  DENY_ACCESS_MODE_MALFORMED,
  DENY_ACCESS_MODE_UNKNOWN,
  DENY_ACCESS_ESCALATION,
  DENY_ACCESS_AUTHORIZATION_REQUIRED
} from "../src/live/access-mode-policy.mjs";
import { McpGatewayCore, REQUIRED_CONTEXT_FIELDS } from "../src/gateway/mcp-gateway-core.mjs";
import { CheckpointLedger } from "../src/ledger/checkpoint-ledger.mjs";

const NUL = String.fromCharCode(0);

// ---------------------------------------------------------------------------
// V-002 Project scope: approved repository read succeeds; unrelated denied
//   Composes ProjectContractService (P0-08). Effectiveness is server-derived,
//   distinct from approval, and fails closed on unknown / forged / revoked.
// ---------------------------------------------------------------------------

const V002_NOW = "2026-07-18T10:00:00Z";
const APPROVED_REPO = "C:/laragon/www/SecB";

function v002Candidate(overrides = {}) {
  return {
    project_id: "prj_v002",
    version: 1,
    profile_id: "software-engineering",
    status: "DRAFT",
    owners: ["human-gov"],
    repositories: [APPROVED_REPO],
    risk_class: "R2",
    evidence_destination: "local://evidence/v002",
    valid_from: "2026-07-01T00:00:00Z",
    valid_until: "2026-12-31T00:00:00Z",
    approvals: [],
    ...overrides
  };
}

function v002Request(overrides = {}) {
  return {
    projectId: "prj_v002",
    version: 1,
    actorId: "agent_gov_002",
    authorityRef: "grant_gov_002",
    evidenceRefs: ["ev_gov_002"],
    idempotencyKey: "idem_v002",
    timestamp: V002_NOW,
    reasonCode: "GOV_DECISION",
    ...overrides
  };
}

// Distinct server-derived governance decision per requested state.
const v002Authority = (context) => ({
  allowed: true,
  decisionId: `d_v002_${context.requestedState.toLowerCase()}`,
  serverDerived: true
});

function v002Service(authorize = v002Authority) {
  return new ProjectContractService({ authorize, now: () => new Date(V002_NOW) });
}

function v002Activate(service) {
  service.register(v002Candidate());
  service.submitForReview(v002Request({ idempotencyKey: "idem_v002_review" }));
  service.approve(v002Request({ idempotencyKey: "idem_v002_approve" }));
  return service.activate(v002Request({ idempotencyKey: "idem_v002_activate" }));
}

test("V-002 project scope: approved repository resolves effective; unrelated/forged/revoked denied", () => {
  // Positive: an ACTIVE project contract resolves effective and exposes the
  // approved repository scope — an approved repository read succeeds.
  const service = v002Service();
  const activated = v002Activate(service);
  assert.equal(activated.state, "ACTIVE");
  const effective = service.resolveEffective({ projectId: "prj_v002", version: 1 });
  assert.equal(effective.allowed, true);
  assert.deepEqual(effective.contract.repositories, [APPROVED_REPO]);

  // Negative: an unrelated / unknown project fails closed — unrelated access denied.
  assert.throws(
    () => service.resolveEffective({ projectId: "prj_unrelated", version: 1 }),
    (error) => error instanceof ProjectContractServiceError && error.code === "DENY_PROJECT_UNKNOWN"
  );

  // Adversarial: forging effectiveness at registration (status already ACTIVE)
  // is refused — a caller cannot self-activate a contract.
  assert.throws(
    () => v002Service().register(v002Candidate({ status: "ACTIVE" })),
    (error) => error instanceof ProjectContractServiceError && error.code === "DENY_INITIAL_STATE"
  );

  // Adversarial: replaying ONE governance decision across two transitions is
  // refused — bound approval cannot be reused (decision-reuse guard).
  const reuse = v002Service(() => ({ allowed: true, decisionId: "d_v002_reused", serverDerived: true }));
  reuse.register(v002Candidate());
  reuse.submitForReview(v002Request({ idempotencyKey: "idem_v002_reuse_review" }));
  assert.throws(
    () => reuse.approve(v002Request({ idempotencyKey: "idem_v002_reuse_approve" })),
    (error) => error instanceof ProjectContractServiceError && error.code === "DENY_DECISION_REUSE"
  );

  // Adversarial: a REVOKED contract no longer resolves effective — a torn-down
  // project cannot be read as if still authorized (fail-closed on use).
  const revokedService = v002Service();
  revokedService.register(v002Candidate());
  revokedService.submitForReview(v002Request({ idempotencyKey: "idem_v002_rv_review" }));
  revokedService.approve(v002Request({ idempotencyKey: "idem_v002_rv_approve" }));
  revokedService.revoke(v002Request({ idempotencyKey: "idem_v002_rv_revoke" }));
  assert.equal(
    revokedService.resolveEffective({ projectId: "prj_v002", version: 1 }).code,
    "DENY_CONTRACT_REVOKED"
  );
});

// ---------------------------------------------------------------------------
// V-010 Terminal: observer can view; observer input denied
//   Composes the access-mode authorization ladder (MOD-LIVE S2). Observe is a
//   read-only mode; any higher (writable/destructive) mode fails closed.
// ---------------------------------------------------------------------------

test("V-010 terminal: read-only observer authorized; escalation and forged access fail closed", () => {
  // Positive: an Observe request against an Observe grant is authorized — the
  // observer can view events/terminal/diff/evidence, no explicit auth required.
  const observe = evaluateAccessRequest({ requestedMode: "Observe", grantedMode: "Observe" });
  assert.equal(observe.ok, true);
  assert.equal(observe.mode, "Observe");
  assert.equal(observe.authorizationSatisfiedBy, "not-required");

  // Negative: an observer (Observe grant) attempting a mutating mode (Control /
  // Emergency = "Enter terminal input" / "Pause, terminate…") is denied by the
  // ladder — observer input denied.
  assert.equal(
    evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Observe" }).code,
    DENY_ACCESS_ESCALATION
  );
  assert.equal(
    evaluateAccessRequest({ requestedMode: "Emergency", grantedMode: "Observe" }).code,
    DENY_ACCESS_ESCALATION
  );

  // Adversarial: prototype-key smuggling — requestedMode/grantedMode supplied on
  // the prototype, not as own properties — is refused, not honoured.
  const smuggled = Object.create({ requestedMode: "Observe", grantedMode: "Observe" });
  assert.equal(evaluateAccessRequest(smuggled).code, DENY_ACCESS_MODE_MALFORMED);

  // Adversarial: a hostile getter on requestedMode is contained (single read,
  // fail-closed) — a throwing accessor never crashes the evaluator.
  const hostile = { grantedMode: "Observe" };
  Object.defineProperty(hostile, "requestedMode", {
    enumerable: true,
    configurable: true,
    get() { throw new Error("hostile accessor"); }
  });
  assert.equal(evaluateAccessRequest(hostile).code, DENY_ACCESS_MODE_MALFORMED);

  // Adversarial: an unknown / case-variant token is never coerced onto a nearby
  // mode — deny-by-default.
  assert.equal(
    evaluateAccessRequest({ requestedMode: "observe", grantedMode: "Observe" }).code,
    DENY_ACCESS_MODE_UNKNOWN
  );
  assert.equal(
    evaluateAccessRequest({ requestedMode: `Obs${NUL}erve`, grantedMode: "Observe" }).code,
    DENY_ACCESS_MODE_MALFORMED
  );

  // Adversarial: a writable/destructive mode (Control) requested even WITH a
  // Control grant but WITHOUT explicit authorization is refused — the doctrine
  // gate cannot be skipped by holding the grant alone.
  assert.equal(
    evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Control" }).code,
    DENY_ACCESS_AUTHORIZATION_REQUIRED
  );
});

// ---------------------------------------------------------------------------
// V-014 MCP: allowed method executes with bounded credential; unapproved denied
//   Composes the MCP gateway dispatch core (SECB-MCP-P0-001). Read-only, context
//   (credential-bearing authorization_id/capability_id) required, secrets in
//   results rejected fail-closed.
// ---------------------------------------------------------------------------

function v014Context(overrides = {}) {
  return {
    agent_id: "agent.claude.motor.01",
    harness_id: "claude-code",
    project_id: "prj_v014",
    work_package_id: "wp_v014",
    workspace_lease_id: "lease-v014-001",
    session_id: "session-v014",
    authorization_id: "auth-v014",
    capability_id: "filesystem.read",
    purpose: "conformance-read",
    evidence_required: true,
    ...overrides
  };
}

function v014Gateway({ adapterImpl, revocationCheck = () => false, resultValidator = () => true } = {}) {
  const entries = [];
  const capabilityRegistry = new Map([
    ["filesystem.read", { adapter_id: "fs-read", tool: "read_text_file", access: "read" }],
    ["workspace.write", { adapter_id: "fs-write", tool: "write_file", access: "write" }]
  ]);
  const adapters = new Map([
    ["fs-read", { invoke: adapterImpl ?? ((tool, params) => ({ tool, echoed: params?.path ?? null })) }]
  ]);
  const gateway = new McpGatewayCore({
    capabilityRegistry,
    adapters,
    invocationLog: (entry) => entries.push(entry),
    now: () => new Date("2026-07-18T10:00:00.000Z"),
    revocationCheck,
    resultValidator
  });
  return { gateway, entries };
}

test("V-014 MCP: bounded read capability dispatches; unapproved/unauthorized/leaking denied", async () => {
  // Positive: a well-formed context carrying a bounded credential
  // (authorization_id + capability_id) invoking an allowlisted READ capability
  // dispatches and returns an untrusted-data receipt.
  const { gateway, entries } = v014Gateway();
  const ok = await gateway.invoke(v014Context(), { path: "README.md" });
  assert.equal(ok.ok, true);
  assert.equal(ok.receipt.content_disposition, "data_untrusted");
  assert.equal(ok.receipt.capability_id, "filesystem.read");
  assert.equal(ok.result.echoed, "README.md");
  assert.ok(entries.some((entry) => entry.disposition === "SUCCESS"), "success audited");

  // Negative: an unapproved capability/method is denied (deny-by-default allowlist).
  assert.equal(
    (await v014Gateway().gateway.invoke(v014Context({ capability_id: "shell.exec" }), {})).deny_code,
    "DENY_UNKNOWN_CAPABILITY"
  );

  // Negative: a non-read (mutating) capability is denied in the read-only P0 profile.
  assert.equal(
    (await v014Gateway().gateway.invoke(v014Context({ capability_id: "workspace.write" }), {})).deny_code,
    "DENY_NON_READ"
  );

  // Negative: a missing bounded credential (authorization_id absent) fails closed
  // on context — an unbounded invocation is refused.
  const noCred = v014Context();
  delete noCred.authorization_id;
  assert.equal((await v014Gateway().gateway.invoke(noCred, {})).deny_code, "DENY_CONTEXT");
  // (guard: authorization_id is genuinely a required context field)
  assert.ok(REQUIRED_CONTEXT_FIELDS.includes("authorization_id"));

  // Adversarial: an adapter result carrying credential material is refused —
  // secrets never cross the gateway boundary (fail-closed result screen).
  const leak = v014Gateway({ adapterImpl: () => ({ secret_token: "ghp_abcdefgh12345678zzzz" }) });
  assert.equal((await leak.gateway.invoke(v014Context(), {})).deny_code, "DENY_RESULT_INVALID");

  // Adversarial: a revoked authorization is denied before dispatch (kill switch).
  const revoked = v014Gateway({ revocationCheck: () => true });
  assert.equal((await revoked.gateway.invoke(v014Context(), {})).deny_code, "DENY_REVOKED");

  // Adversarial: prototype-pollution in params (__proto__ own key) is refused at
  // request normalization — never dispatched.
  const polluted = JSON.parse('{"__proto__":{"polluted":true},"path":"x"}');
  assert.equal((await v014Gateway().gateway.invoke(v014Context(), polluted)).deny_code, "DENY_REQUEST_INVALID");
});

// ---------------------------------------------------------------------------
// V-016 Recovery (PARTIAL): verified checkpoint resume-point resolves; unknown
//   session/checkpoint fails closed; a tampered checkpoint ledger is detected by
//   the hash chain.
//
//   BLOCKED HALF (honest, NOT covered here): the source-ledger DRIFT comparator
//   ("drifted checkpoint denied" — compare source_ledger_id @
//   sequence_at_checkpoint against the live head) is checkpoint-ledger non-goal
//   #3 (restore-execution) and stays a stub in conformance-stubs.test.mjs.
// ---------------------------------------------------------------------------

function v016Checkpoint(overrides = {}) {
  return {
    checkpoint_id: "chk_v016_001",
    version: 1,
    project_id: "prj_v016",
    work_package_id: "wp_v016",
    session_id: "ses_v016",
    actor_id: "claude-motor-conformance",
    source_ledger_id: "secb-event-ledger",
    sequence_at_checkpoint: 1,
    state_snapshot_ref: "opaque://session-snapshots/ses_v016/1",
    created_at: "2026-07-18T10:00:00Z",
    content_hash: "a".repeat(64),
    ...overrides
  };
}

test("V-016 recovery (partial): resume-point resolves; unknown fails closed; tamper detected", () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-v016-"));
  try {
    const path = join(dir, "checkpoints.ndjson");
    const ledger = new CheckpointLedger({ filePath: path });
    ledger.appendCheckpoint(v016Checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_v016_1" });
    ledger.appendCheckpoint(
      v016Checkpoint({ checkpoint_id: "chk_v016_002", sequence_at_checkpoint: 2 }),
      { expectedSequence: 1, idempotencyKey: "idem_v016_2" }
    );

    // Positive: a verified checkpoint resolves to the latest resume point.
    const latest = ledger.resolveLatest("ses_v016");
    assert.equal(latest.code, "ALLOW");
    assert.equal(latest.checkpoint.checkpoint_id, "chk_v016_002");
    assert.equal(ledger.resolveCheckpoint("chk_v016_001").code, "ALLOW");

    // Negative: an unknown checkpoint / session must not silently resume from
    // nothing — each fails closed with a typed NONE.
    assert.equal(ledger.resolveCheckpoint("chk_ghost").code, "DENY_UNKNOWN_CHECKPOINT");
    assert.equal(ledger.resolveLatest("ses_ghost").code, "DENY_UNKNOWN_SESSION");
    assert.equal(ledger.resolveCheckpoint("").code, "DENY_INVALID_CHECKPOINT_ID");
    assert.equal(ledger.resolveLatest(42).code, "DENY_INVALID_SESSION_ID");

    // Adversarial: tampering the persisted checkpoint record breaks the hash
    // chain — a drifted/forged resume point is detected, not trusted.
    const raw = readFileSync(path, "utf8").trim().split("\n");
    const record0 = JSON.parse(raw[0]);
    record0.entry.payload.state_snapshot_ref = "opaque://attacker/forged";
    raw[0] = JSON.stringify(record0);
    writeFileSync(path, raw.join("\n") + "\n", "utf8");
    const reopened = new CheckpointLedger({ filePath: path });
    assert.throws(() => reopened.verify(), (error) => error.code === "LEDGER_INTEGRITY_FAILURE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Byte-identity guard (main @ 4abfff2)
//   Proves every primitive this candidate composes is unmodified. If any pinned
//   blob drifts, the candidate has silently mutated a primitive and this fails.
//
//   DISCLOSED, ATTRIBUTED UPDATE (bst/mod-runtime-s1-checkpoint-ordering-fix-001):
//   src/ledger/checkpoint-ledger.mjs's pin below is intentionally re-pinned to
//   this branch's post-fix blob, for the same reason documented at the
//   analogous guard in conformance-v016-drift.test.mjs: this branch closes
//   mod-runtime-s1-checkpoint-ledger-second-independent-review-001 §1 by
//   deliberately modifying checkpoint-ledger.mjs itself (resolveLatest now
//   resolves by sequence_at_checkpoint content order; appendCheckpoint gained
//   a preWriteCheck-based write-side regression + actor_id-continuity gate).
//   Every other pinned blob below is unchanged and still pinned to main @
//   4abfff2, proving this fix touched only its intended target.
// ---------------------------------------------------------------------------

function repoPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function gitBlobSha1(rel) {
  const normalized = readFileSync(repoPath(rel), "utf8").replace(/\r\n/g, "\n");
  const body = Buffer.from(normalized, "utf8");
  const header = Buffer.from(`blob ${body.length}${NUL}`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

// Directly-imported primitives + their load-bearing transitive dependencies,
// pinned to `git rev-parse 4abfff2:<file>`.
const PINNED_BLOBS = Object.freeze({
  "src/project/project-contract-service.mjs": "b88e20299f40dfa9322a5f2fc8c39a85555950a4",
  "src/live/access-mode-policy.mjs": "5d96eec7af6e717218a81ea5563e09c6b18d191b",
  "src/control/risk-registry.mjs": "b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816",
  "src/gateway/mcp-gateway-core.mjs": "ec22a296e280d1c15a26840fba12afb34765c8d8",
  "src/ledger/checkpoint-ledger.mjs": "c072a6207e2fa409a498429be76d95df4f363cf7",
  "src/ledger/durable-ledger.mjs": "6be08fc14ff31a7c871c5e86888af42285d40529",
  // Re-pinned after 61940ac: the registration map is the union of both merge
  // parents (24 ours + 20 main -> 31, nothing dropped, nothing invented).
  "src/contracts/contract-validator.mjs": "dc1e32cadc8eec45b2c34acf1828cc8c7f44dbab",
  "src/contracts/canonical-fingerprint.mjs": "721e99032ce7040312e77138c8f156b649fd996e"
});

test("byte-identity: every primitive composed by this candidate is unchanged vs main @ 4abfff2", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} blob-identical to main @ 4abfff2`);
  }
});
