// Tests for the MOD-RUNTIME Slice S3 approval-binding primitive
// (src/control/approval-binding.mjs), an UNWIRED CANDIDATE extraction of the
// duplicated N-5 approval-gate shape in
// src/gateway/capability-registry-service.mjs (promote()) and
// src/services/goal-graph-service.mjs (retireGoal({force}) ->
// evaluateForceRetireApprovals()).
//
// Three groups of coverage:
//   1. Disposition-matrix tests of the primitive itself (well-formedness,
//      role-matching modes, self-approval, SoD violation).
//   2. PARITY tests: the SAME approval bundles are run through (a) the real,
//      unmodified CapabilityRegistryService.promote() / GoalGraphService's
//      retireGoal({force}) and (b) evaluateApprovalBinding(), asserting
//      identical accept/deny outcomes — proving behavior-equivalence without
//      swapping either service onto the primitive.
//   3. bindApprovalDecision / verifyApprovalBinding tests, including genuine
//      DecisionLedger recording (mirrors tests/retry-policy.test.mjs).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  APPROVAL_BOUND,
  GOVERNANCE_ROLE,
  INDEPENDENT_REVIEW_ROLE,
  approvalWellFormed,
  bindApprovalDecision,
  evaluateApprovalBinding,
  verifyApprovalBinding
} from "../src/control/approval-binding.mjs";
import { riskProfile } from "../src/control/risk-registry.mjs";
import { DecisionLedger } from "../src/ledger/temporal-ledgers.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import { CapabilityRegistryService } from "../src/gateway/capability-registry-service.mjs";
import { GoalGraphService } from "../src/services/goal-graph-service.mjs";

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-approval-binding-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const IDS = Object.freeze({
  project: "prj_secb_local",
  workPackage: "wp_p0_modruntime_s3",
  session: "ses_modruntime_s3"
});

function identity(overrides = {}) {
  return {
    decisionId: "dec_approval_001",
    projectId: IDS.project,
    workPackageId: IDS.workPackage,
    sessionId: IDS.session,
    actorId: "operator.gov.01",
    authorityRef: "authority:not-established",
    decidedAt: "2026-07-21T12:00:00Z",
    validFrom: "2026-07-21T12:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// 1. approvalWellFormed — shared shape check
// ---------------------------------------------------------------------------

test("approvalWellFormed accepts a well-formed approval", () => {
  assert.equal(approvalWellFormed({ role: "governance", actor_id: "gov-1", decided_at: "2026-07-20T09:00:00Z" }), true);
});

test("approvalWellFormed denies malformed approvals", () => {
  assert.equal(approvalWellFormed(null), false);
  assert.equal(approvalWellFormed("governance"), false);
  assert.equal(approvalWellFormed([]), false);
  assert.equal(approvalWellFormed({ role: "", actor_id: "gov-1", decided_at: "2026-07-20T09:00:00Z" }), false);
  assert.equal(approvalWellFormed({ role: "governance", actor_id: "", decided_at: "2026-07-20T09:00:00Z" }), false);
  assert.equal(approvalWellFormed({ role: "governance", actor_id: "gov-1", decided_at: "not-a-date" }), false);
  assert.equal(approvalWellFormed({ role: "governance", actor_id: "gov-1" }), false);
});

// ---------------------------------------------------------------------------
// 2. evaluateApprovalBinding — disposition matrix
// ---------------------------------------------------------------------------

function strictBundle(overrides = {}) {
  return {
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: "rev-1", decided_at: "2026-07-20T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: "gov-1", decided_at: "2026-07-20T09:05:00Z" }
    ],
    producerActorId: "producer-1",
    roleMatchMode: "strict",
    ...overrides
  };
}

test("evaluateApprovalBinding (strict) authorizes a well-formed, pairwise-distinct N-5 bundle", () => {
  const result = evaluateApprovalBinding(strictBundle());
  assert.equal(result.ok, true);
  assert.equal(result.independent.actor_id, "rev-1");
  assert.equal(result.governance.actor_id, "gov-1");
});

test("evaluateApprovalBinding denies a missing, empty, or single-approval bundle", () => {
  for (const approvals of [undefined, [], [strictBundle().approvals[0]], [strictBundle().approvals[1]]]) {
    assert.deepEqual(evaluateApprovalBinding({ approvals, producerActorId: "producer-1" }), { ok: false, code: "DENY_APPROVALS" });
  }
});

test("evaluateApprovalBinding denies a bundle with a malformed approval entry", () => {
  const result = evaluateApprovalBinding(strictBundle({
    approvals: [...strictBundle().approvals, { role: "extra", actor_id: "", decided_at: "2026-07-20T09:00:00Z" }]
  }));
  assert.deepEqual(result, { ok: false, code: "DENY_APPROVALS" });
});

test("evaluateApprovalBinding denies a blank producerActorId", () => {
  assert.deepEqual(evaluateApprovalBinding(strictBundle({ producerActorId: "" })), { ok: false, code: "DENY_APPROVALS" });
  assert.deepEqual(evaluateApprovalBinding(strictBundle({ producerActorId: null })), { ok: false, code: "DENY_APPROVALS" });
});

test("evaluateApprovalBinding denies independent review by the producer as self-approval", () => {
  const result = evaluateApprovalBinding(strictBundle({ producerActorId: "rev-1" }));
  assert.deepEqual(result, { ok: false, code: "DENY_SELF_APPROVAL" });
});

test("evaluateApprovalBinding denies one non-producer actor holding both approvals as an SoD violation", () => {
  const result = evaluateApprovalBinding(strictBundle({
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: "mallory", decided_at: "2026-07-20T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: "mallory", decided_at: "2026-07-20T09:05:00Z" }
    ]
  }));
  assert.deepEqual(result, { ok: false, code: "DENY_SOD_VIOLATION" });
});

test("evaluateApprovalBinding denies the producer holding the governance role as an SoD violation", () => {
  const result = evaluateApprovalBinding(strictBundle({
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: "rev-1", decided_at: "2026-07-20T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: "producer-1", decided_at: "2026-07-20T09:05:00Z" }
    ]
  }));
  assert.deepEqual(result, { ok: false, code: "DENY_SOD_VIOLATION" });
});

test("evaluateApprovalBinding denies an unrecognized roleMatchMode", () => {
  assert.deepEqual(evaluateApprovalBinding(strictBundle({ roleMatchMode: "loose" })), { ok: false, code: "DENY_INVALID_ROLE_MATCH_MODE" });
});

// --- Role-matching DRIFT: strict vs. normalized -----------------------------

test("DRIFT: a canonical REV/GOV role token is accepted in normalized mode but denied in strict mode", () => {
  const bundle = {
    approvals: [
      { role: "REV", actor_id: "rev-1", decided_at: "2026-07-20T09:00:00Z" },
      { role: "GOV", actor_id: "gov-1", decided_at: "2026-07-20T09:05:00Z" }
    ],
    producerActorId: "producer-1"
  };
  // capability-registry-service.mjs's exact-string gate would reject this
  // bundle outright (role !== "independent_review"/"governance" literally).
  assert.deepEqual(evaluateApprovalBinding({ ...bundle, roleMatchMode: "strict" }), { ok: false, code: "DENY_APPROVALS" });
  // goal-graph-service.mjs's normalizeRole-based gate accepts it.
  const normalized = evaluateApprovalBinding({ ...bundle, roleMatchMode: "normalized" });
  assert.equal(normalized.ok, true);
});

test("DRIFT: the \"reviewer\" alias is accepted in normalized mode but denied in strict mode", () => {
  const bundle = {
    approvals: [
      { role: "reviewer", actor_id: "rev-1", decided_at: "2026-07-20T09:00:00Z" },
      { role: "governance", actor_id: "gov-1", decided_at: "2026-07-20T09:05:00Z" }
    ],
    producerActorId: "producer-1"
  };
  assert.deepEqual(evaluateApprovalBinding({ ...bundle, roleMatchMode: "strict" }), { ok: false, code: "DENY_APPROVALS" });
  assert.equal(evaluateApprovalBinding({ ...bundle, roleMatchMode: "normalized" }).ok, true);
});

test("both modes agree on the literal role strings each live service actually emits", () => {
  const bundle = strictBundle();
  assert.equal(evaluateApprovalBinding({ ...bundle, roleMatchMode: "strict" }).ok, true);
  assert.equal(evaluateApprovalBinding({ ...bundle, roleMatchMode: "normalized" }).ok, true);
});

// ---------------------------------------------------------------------------
// 3. PARITY: same inputs through the real services vs. the primitive
// ---------------------------------------------------------------------------

const FIXED_NOW = () => new Date("2026-07-20T10:00:00.000Z");
const CAP_PRODUCER = "modelcontextprotocol";

function validCapabilityRecord(overrides = {}) {
  return {
    capability_id: "filesystem.read",
    version: "1.0.0",
    adapter_id: "fs-read",
    tool: "read_text_file",
    access: "read",
    status: "CANDIDATE",
    source_identity: {
      maintainer: CAP_PRODUCER,
      repository: "https://github.com/modelcontextprotocol/servers",
      namespace: "@modelcontextprotocol/server-filesystem"
    },
    immutable_version: {
      commit: "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
      tag_or_digest: "sha256:aa11bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff"
    },
    integrity: { sha256: "aa11bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff" },
    tool_inventory: ["read_text_file"],
    filesystem_boundary: "workspace-lease-root-read-only",
    network_boundary: "none",
    credential_handle: null,
    intake_evidence_refs: ["evidence:intake:fs-read:0001"],
    approvals: [],
    revocation: { revoked: false, reason: null, known_bad_versions: [] },
    ...overrides
  };
}

function freshCapabilityRegistryService() {
  const service = new CapabilityRegistryService({
    schemaValidator: (record) => validateContract("capabilityRecord", record),
    ledgerWriter: () => {},
    now: FIXED_NOW
  });
  service.registerCandidate(validCapabilityRecord());
  return service;
}

// Table-driven parity: each case is an approvals bundle plus the deny_code
// (or "ALLOW") the LIVE capability-registry-service.promote() gate produces
// today. Cases are taken verbatim from tests/capability-registry-service.test.mjs.
const CAPABILITY_REGISTRY_PARITY_CASES = [
  { name: "full N-5 bundle authorizes", approvals: () => ([
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: "agent.claude.rev.01", decided_at: "2026-07-20T09:00:00.000Z" },
    { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" }
  ]), expected: "ALLOW" },
  { name: "missing bundle denies DENY_APPROVALS", approvals: () => undefined, expected: "DENY_APPROVALS" },
  { name: "empty bundle denies DENY_APPROVALS", approvals: () => ([]), expected: "DENY_APPROVALS" },
  { name: "independent-only denies DENY_APPROVALS", approvals: () => ([
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: "agent.claude.rev.01", decided_at: "2026-07-20T09:00:00.000Z" }
  ]), expected: "DENY_APPROVALS" },
  { name: "governance-only denies DENY_APPROVALS", approvals: () => ([
    { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" }
  ]), expected: "DENY_APPROVALS" },
  { name: "malformed extra entry denies DENY_APPROVALS", approvals: () => ([
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: "agent.claude.rev.01", decided_at: "2026-07-20T09:00:00.000Z" },
    { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" },
    { role: "extra", actor_id: "", decided_at: "2026-07-20T09:00:00.000Z" }
  ]), expected: "DENY_APPROVALS" },
  { name: "independent-review-is-producer denies DENY_SELF_APPROVAL", approvals: () => ([
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: CAP_PRODUCER, decided_at: "2026-07-20T09:00:00.000Z" },
    { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" }
  ]), expected: "DENY_SELF_APPROVAL" },
  { name: "one actor holds both approvals denies DENY_SOD_VIOLATION", approvals: () => ([
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: "mallory", decided_at: "2026-07-20T09:00:00.000Z" },
    { role: GOVERNANCE_ROLE, actor_id: "mallory", decided_at: "2026-07-20T09:05:00.000Z" }
  ]), expected: "DENY_SOD_VIOLATION" },
  { name: "producer holds governance role denies DENY_SOD_VIOLATION", approvals: () => ([
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: "agent.claude.rev.01", decided_at: "2026-07-20T09:00:00.000Z" },
    { role: GOVERNANCE_ROLE, actor_id: CAP_PRODUCER, decided_at: "2026-07-20T09:05:00.000Z" }
  ]), expected: "DENY_SOD_VIOLATION" },
  // DRIFT case: canonical role tokens are rejected by the LIVE service too
  // (exact-string match), confirming evaluateApprovalBinding's "strict" mode
  // reproduces this, not just the assessment's description of it.
  { name: "canonical REV/GOV tokens deny DENY_APPROVALS on the live service (drift confirmation)", approvals: () => ([
    { role: "REV", actor_id: "agent.claude.rev.01", decided_at: "2026-07-20T09:00:00.000Z" },
    { role: "GOV", actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" }
  ]), expected: "DENY_APPROVALS" }
];

for (const { name, approvals, expected } of CAPABILITY_REGISTRY_PARITY_CASES) {
  test(`PARITY capability-registry-service.promote(): ${name}`, () => {
    const service = freshCapabilityRegistryService();
    const liveOutcome = service.promote("filesystem.read", "1.0.0", approvals());
    const liveCode = liveOutcome.ok ? "ALLOW" : liveOutcome.deny_code;
    assert.equal(liveCode, expected, "fixture drifted from the live service's actual current behavior");

    const primitiveOutcome = evaluateApprovalBinding({
      approvals: approvals(),
      producerActorId: CAP_PRODUCER,
      roleMatchMode: "strict"
    });
    const primitiveCode = primitiveOutcome.ok ? "ALLOW" : primitiveOutcome.code;
    assert.equal(primitiveCode, liveCode, "evaluateApprovalBinding(strict) diverged from the live capability-registry-service.promote() outcome");
  });
}

// --- goal-graph-service.mjs parity ------------------------------------------

const GOAL_HASH = "a".repeat(64);
const goalSchemaValidator = (record) => validateContract("goal", record);

function provenance(agentId = "claude-motor") {
  return { source: "mod-work-gap-assessment-001.md", agent_id: agentId, created_at: "2026-07-19T10:00:00+07:00" };
}

function portfolio(overrides = {}) {
  return { goal_id: "g_portfolio", version: 1, project_id: "prj_secb_local", level: "PORTFOLIO", title: "Portfolio", status: "ACTIVE", parent_goal_id: null, provenance: provenance(), content_hash: GOAL_HASH, ...overrides };
}
function product(overrides = {}) {
  return { goal_id: "g_product", version: 1, project_id: "prj_secb_local", level: "PRODUCT", title: "Product", status: "ACTIVE", parent_goal_id: "g_portfolio", provenance: provenance(), content_hash: GOAL_HASH, ...overrides };
}
function objective(overrides = {}) {
  return { goal_id: "g_objective", version: 1, project_id: "prj_secb_local", level: "OBJECTIVE", title: "Objective", status: "ACTIVE", parent_goal_id: "g_product", provenance: provenance(), content_hash: GOAL_HASH, ...overrides };
}

function freshGoalGraphServiceWithLinkedObjective() {
  const service = new GoalGraphService({
    schemaValidator: goalSchemaValidator,
    ledgerWriter: () => {},
    workPackageResolver: () => ({ allowed: true }),
    now: () => new Date("2026-07-19T10:00:00Z")
  });
  assert.equal(service.registerGoal(portfolio()).ok, true);
  assert.equal(service.registerGoal(product()).ok, true);
  assert.equal(service.registerGoal(objective()).ok, true);
  service.linkWorkPackage("g_objective", "wp_1");
  return service;
}

const GOAL_GRAPH_PARITY_CASES = [
  { name: "full N-5 bundle authorizes", approvals: () => ([
    { role: "independent_review", actor_id: "rev-1", decided_at: "2026-07-19T09:00:00Z" },
    { role: "governance", actor_id: "gov-1", decided_at: "2026-07-19T09:30:00Z" }
  ]), expected: "ALLOW" },
  { name: "missing bundle denies DENY_APPROVALS", approvals: () => undefined, expected: "DENY_APPROVALS" },
  { name: "independent-review-is-producer denies DENY_SELF_APPROVAL", approvals: () => ([
    { role: "independent_review", actor_id: "claude-motor", decided_at: "2026-07-19T09:00:00Z" },
    { role: "governance", actor_id: "gov-1", decided_at: "2026-07-19T09:30:00Z" }
  ]), expected: "DENY_SELF_APPROVAL" },
  { name: "one actor holds both approvals denies DENY_SOD_VIOLATION", approvals: () => ([
    { role: "independent_review", actor_id: "same", decided_at: "2026-07-19T09:00:00Z" },
    { role: "governance", actor_id: "same", decided_at: "2026-07-19T09:30:00Z" }
  ]), expected: "DENY_SOD_VIOLATION" },
  { name: "producer holds governance role denies DENY_SOD_VIOLATION", approvals: () => ([
    { role: "independent_review", actor_id: "rev-1", decided_at: "2026-07-19T09:00:00Z" },
    { role: "governance", actor_id: "claude-motor", decided_at: "2026-07-19T09:30:00Z" }
  ]), expected: "DENY_SOD_VIOLATION" },
  // Confirms goal-graph-service really does accept the wider alias
  // vocabulary (normalizeRole), unlike capability-registry-service.
  { name: "canonical REV/GOV tokens ALSO authorize on the live service (drift confirmation)", approvals: () => ([
    { role: "REV", actor_id: "rev-1", decided_at: "2026-07-19T09:00:00Z" },
    { role: "GOV", actor_id: "gov-1", decided_at: "2026-07-19T09:30:00Z" }
  ]), expected: "ALLOW" }
];

for (const { name, approvals, expected } of GOAL_GRAPH_PARITY_CASES) {
  test(`PARITY goal-graph-service.retireGoal({force}): ${name}`, () => {
    const service = freshGoalGraphServiceWithLinkedObjective();
    const liveOutcome = service.retireGoal("g_objective", { force: true, approvals: approvals() });
    const liveCode = liveOutcome.ok ? "ALLOW" : liveOutcome.deny_code;
    assert.equal(liveCode, expected, "fixture drifted from the live service's actual current behavior");

    const primitiveOutcome = evaluateApprovalBinding({
      approvals: approvals(),
      producerActorId: "claude-motor",
      roleMatchMode: "normalized"
    });
    const primitiveCode = primitiveOutcome.ok ? "ALLOW" : primitiveOutcome.code;
    assert.equal(primitiveCode, liveCode, "evaluateApprovalBinding(normalized) diverged from the live goal-graph-service.retireGoal({force}) outcome");
  });
}

// ---------------------------------------------------------------------------
// 4. bindApprovalDecision / verifyApprovalBinding
// ---------------------------------------------------------------------------

test("bindApprovalDecision mints a GOVERNANCE candidate with outcome APPROVAL_BOUND on authorization", () => {
  const evaluation = evaluateApprovalBinding(strictBundle());
  const record = bindApprovalDecision(evaluation, identity({ boundAction: "PROMOTE", boundObjectVersion: "filesystem.read@1.0.0" }));
  assert.equal(record.decision_type, "GOVERNANCE");
  assert.equal(record.outcome, APPROVAL_BOUND);
  // F2: injective JSON-array encoding of the (action, objectVersion) pair.
  assert.deepEqual(record.evidence_refs, ['approval-binding:["PROMOTE","filesystem.read@1.0.0"]']);
  assert.ok(record.rationale.length > 0);
});

test("bindApprovalDecision mints a candidate whose outcome is the exact deny code", () => {
  const evaluation = evaluateApprovalBinding(strictBundle({ producerActorId: "rev-1" }));
  const record = bindApprovalDecision(evaluation, identity({ decisionId: "dec_approval_002" }));
  assert.equal(record.decision_type, "GOVERNANCE");
  assert.equal(record.outcome, "DENY_SELF_APPROVAL");
  assert.ok(record.rationale.includes("independent-review"));
});

test("bindApprovalDecision performs no I/O — a candidate can be built without any ledger existing", () => {
  const evaluation = evaluateApprovalBinding(strictBundle());
  const record = bindApprovalDecision(evaluation, identity({ decisionId: "dec_approval_003" }));
  assert.equal(typeof record, "object");
});

test("bindApprovalDecision leaves evidence_refs empty when no boundAction/boundObjectVersion is supplied", () => {
  const evaluation = evaluateApprovalBinding(strictBundle());
  const record = bindApprovalDecision(evaluation, identity());
  assert.deepEqual(record.evidence_refs, []);
});

// --- Real ledger recording ---------------------------------------------------

test("an APPROVAL_BOUND disposition is genuinely appended to DecisionLedger and hash-chain verifies", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const evaluation = evaluateApprovalBinding(strictBundle());
  assert.equal(evaluation.ok, true);

  const record = bindApprovalDecision(evaluation, identity({
    decisionId: "dec_approval_bound_001",
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  const appended = ledger.appendDecision(record, { expectedSequence: 0, idempotencyKey: "idem_approval_bound_001" });
  assert.equal(appended.sequence, 1);

  const reopened = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const persisted = reopened.read();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].entry.payload.outcome, APPROVAL_BOUND);
  assert.equal(persisted[0].entry.payload.decision_type, "GOVERNANCE");
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-decision-ledger",
    count: 1,
    headHash: appended.recordHash
  });

  const resolved = reopened.resolveEffective("dec_approval_bound_001", { at: "2026-08-01T00:00:00Z" });
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.decision.outcome, APPROVAL_BOUND);

  const verified = verifyApprovalBinding(resolved.decision, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" });
  assert.deepEqual(verified, { ok: true });
}));

test("every denial disposition in the matrix is genuinely appended to DecisionLedger, not just returned", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });

  const denialCases = [
    { name: "self_approval", evaluation: evaluateApprovalBinding(strictBundle({ producerActorId: "rev-1" })) },
    { name: "sod_violation", evaluation: evaluateApprovalBinding(strictBundle({
      approvals: [
        { role: INDEPENDENT_REVIEW_ROLE, actor_id: "mallory", decided_at: "2026-07-20T09:00:00Z" },
        { role: GOVERNANCE_ROLE, actor_id: "mallory", decided_at: "2026-07-20T09:05:00Z" }
      ]
    })) },
    { name: "missing_approvals", evaluation: evaluateApprovalBinding({ approvals: [], producerActorId: "producer-1" }) }
  ];

  let expectedSequence = 0;
  for (const { name, evaluation } of denialCases) {
    assert.equal(evaluation.ok, false);
    const record = bindApprovalDecision(evaluation, identity({
      decisionId: `dec_approval_deny_${name}`,
      boundAction: "PROMOTE",
      boundObjectVersion: "filesystem.read@1.0.0"
    }));
    const appended = ledger.appendDecision(record, { expectedSequence, idempotencyKey: `idem_approval_deny_${name}` });
    expectedSequence = appended.sequence;
  }

  const reopened = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const persisted = reopened.read();
  assert.equal(persisted.length, denialCases.length);
  assert.deepEqual(
    persisted.map((record) => record.entry.payload.outcome),
    ["DENY_SELF_APPROVAL", "DENY_SOD_VIOLATION", "DENY_APPROVALS"]
  );
  for (const record of persisted) {
    assert.equal(record.entry.payload.decision_type, "GOVERNANCE");
  }
  assert.equal(reopened.verify().valid, true);
}));

test("a malformed candidate omitting identity fields is denied by the ledger's own contract validation, not silently accepted", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const evaluation = evaluateApprovalBinding(strictBundle());
  const incompleteRecord = bindApprovalDecision(evaluation, { decisionId: "dec_approval_incomplete" });
  assert.throws(
    () => ledger.appendDecision(incompleteRecord, { expectedSequence: 0, idempotencyKey: "idem_incomplete" }),
    (error) => error.code === "DENY_CONTRACT_INVALID"
  );
}));

// --- verifyApprovalBinding: replay / wrong-version denial (V-009 negative) --

test("verifyApprovalBinding allows exact action + version match", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.deepEqual(verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }), { ok: true });
});

test("verifyApprovalBinding denies a wrong action (replay against a different action)", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.deepEqual(verifyApprovalBinding(record, { exactAction: "REVOKE", objectVersion: "filesystem.read@1.0.0" }), { ok: false, code: "DENY_ACTION_VERSION_MISMATCH" });
});

test("verifyApprovalBinding denies a wrong object version (wrong-version replay)", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.deepEqual(verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "filesystem.read@2.0.0" }), { ok: false, code: "DENY_ACTION_VERSION_MISMATCH" });
});

test("verifyApprovalBinding denies a candidate that was never bound to any action/version", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity());
  assert.deepEqual(verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }), { ok: false, code: "DENY_ACTION_VERSION_MISMATCH" });
});

test("verifyApprovalBinding denies a decision that was denied (wrong outcome), never treating a denial as approved", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle({ producerActorId: "rev-1" })), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.deepEqual(verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }), { ok: false, code: "DENY_NOT_APPROVED" });
});

test("verifyApprovalBinding denies a decision of the wrong decision_type", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.deepEqual(
    verifyApprovalBinding({ ...record, decision_type: "DISPOSITION" }, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }),
    { ok: false, code: "DENY_WRONG_DECISION_TYPE" }
  );
});

test("verifyApprovalBinding denies an unknown (null/undefined) resolved decision", () => {
  assert.deepEqual(verifyApprovalBinding(null, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }), { ok: false, code: "DENY_UNKNOWN_APPROVAL" });
  assert.deepEqual(verifyApprovalBinding(undefined, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }), { ok: false, code: "DENY_UNKNOWN_APPROVAL" });
});

test("verifyApprovalBinding denies a malformed verification request (blank action/version)", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.deepEqual(verifyApprovalBinding(record, { exactAction: "", objectVersion: "filesystem.read@1.0.0" }), { ok: false, code: "DENY_MALFORMED_VERIFICATION_REQUEST" });
  assert.deepEqual(verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "" }), { ok: false, code: "DENY_MALFORMED_VERIFICATION_REQUEST" });
  assert.deepEqual(verifyApprovalBinding(record, {}), { ok: false, code: "DENY_MALFORMED_VERIFICATION_REQUEST" });
});

// ---------------------------------------------------------------------------
// 5. F1 (HIGH): risk-registry.humanApproval short-circuit composition
// ---------------------------------------------------------------------------
// Spec §S3: "Composes risk-registry.riskProfile(riskClass).humanApproval to
// short-circuit ALLOW when no human gate is required." Deny-by-default: ONLY an
// explicit humanApproval === false short-circuits; true / undefined / null /
// unknown-class all require the bound human decision (fail-closed).

// Parity pin against risk-registry's ACTUAL table — if MOD-GOV S2's
// humanApproval flags ever drift, this test fails rather than the short-circuit
// silently changing meaning.
test("F1 parity: risk-registry humanApproval table is R0/R1/R2=false, R3/R4=true", () => {
  assert.equal(riskProfile("R0").value.humanApproval, false);
  assert.equal(riskProfile("R1").value.humanApproval, false);
  assert.equal(riskProfile("R2").value.humanApproval, false);
  assert.equal(riskProfile("R3").value.humanApproval, true);
  assert.equal(riskProfile("R4").value.humanApproval, true);
  assert.equal(riskProfile("R9").ok, false); // unknown class denies
});

test("F1: explicit humanApproval:false (R0/R1/R2) short-circuits to ALLOW with NO bound human decision", () => {
  // No resolved decision at all — the short-circuit must still allow, because
  // an R0/R1/R2 class carries no human gate to satisfy.
  for (const riskClass of ["R0", "R1", "R2"]) {
    assert.deepEqual(
      verifyApprovalBinding(null, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0", riskClass }),
      { ok: true, humanApprovalRequired: false },
      `expected ${riskClass} to short-circuit ALLOW`
    );
  }
});

test("F1: humanApproval:true (R3/R4) REQUIRES the bound decision — allows only with a matching bound approval", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  for (const riskClass of ["R3", "R4"]) {
    // With a valid bound decision, the normal verification path allows.
    assert.deepEqual(
      verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0", riskClass }),
      { ok: true },
      `expected ${riskClass} with a bound decision to ALLOW via the full path`
    );
    // Without any bound decision, it fails closed (no short-circuit).
    assert.deepEqual(
      verifyApprovalBinding(null, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0", riskClass }),
      { ok: false, code: "DENY_UNKNOWN_APPROVAL" },
      `expected ${riskClass} with no bound decision to DENY`
    );
  }
});

test("F1: undefined / null / unknown-class riskClass all fail-closed (require the bound decision, DENY without it)", () => {
  // undefined riskClass (not passed) — normal path requires a bound decision.
  assert.deepEqual(
    verifyApprovalBinding(null, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }),
    { ok: false, code: "DENY_UNKNOWN_APPROVAL" }
  );
  // explicit null riskClass — riskProfile(null) denies, no short-circuit.
  assert.deepEqual(
    verifyApprovalBinding(null, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0", riskClass: null }),
    { ok: false, code: "DENY_UNKNOWN_APPROVAL" }
  );
  // unknown class — riskProfile denies, no short-circuit.
  assert.deepEqual(
    verifyApprovalBinding(null, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0", riskClass: "R9" }),
    { ok: false, code: "DENY_UNKNOWN_APPROVAL" }
  );
});

test("F1: the short-circuit never overrides a malformed verification request", () => {
  // Even for an R0 (humanApproval:false) class, a blank action/version request
  // is rejected before the short-circuit — the request itself is malformed.
  assert.deepEqual(
    verifyApprovalBinding(null, { exactAction: "", objectVersion: "filesystem.read@1.0.0", riskClass: "R0" }),
    { ok: false, code: "DENY_MALFORMED_VERIFICATION_REQUEST" }
  );
});

// ---------------------------------------------------------------------------
// 6. F2 (MEDIUM): injective binding encoding — collision regression
// ---------------------------------------------------------------------------
// The reviewer's exact collision probe (rev-001 §P8): an approval minted for
// action "PROMOTE@filesystem.read" + version "1.0.0" must NOT verify for action
// "PROMOTE" + version "filesystem.read@1.0.0" (and vice versa). Under the prior
// `${action}@${version}` encoding both flattened to the same string and the
// second verify ALLOWED — the whole exact-action/version bind (MR-3) was
// defeatable. Both directions must now DENY.

test("F2 collision probe: (PROMOTE@filesystem.read, 1.0.0) must NOT verify as (PROMOTE, filesystem.read@1.0.0)", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE@filesystem.read",
    boundObjectVersion: "1.0.0"
  }));
  // The exact pair it was bound to still verifies.
  assert.deepEqual(
    verifyApprovalBinding(record, { exactAction: "PROMOTE@filesystem.read", objectVersion: "1.0.0" }),
    { ok: true }
  );
  // The colliding split must DENY.
  assert.deepEqual(
    verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }),
    { ok: false, code: "DENY_ACTION_VERSION_MISMATCH" }
  );
});

test("F2 collision probe (reverse): (PROMOTE, filesystem.read@1.0.0) must NOT verify as (PROMOTE@filesystem.read, 1.0.0)", () => {
  const record = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE",
    boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.deepEqual(
    verifyApprovalBinding(record, { exactAction: "PROMOTE", objectVersion: "filesystem.read@1.0.0" }),
    { ok: true }
  );
  assert.deepEqual(
    verifyApprovalBinding(record, { exactAction: "PROMOTE@filesystem.read", objectVersion: "1.0.0" }),
    { ok: false, code: "DENY_ACTION_VERSION_MISMATCH" }
  );
});

test("F2: the two colliding binds produce DISTINCT evidence_refs entries", () => {
  const a = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE@filesystem.read", boundObjectVersion: "1.0.0"
  }));
  const b = bindApprovalDecision(evaluateApprovalBinding(strictBundle()), identity({
    boundAction: "PROMOTE", boundObjectVersion: "filesystem.read@1.0.0"
  }));
  assert.notDeepEqual(a.evidence_refs, b.evidence_refs);
});

// ---------------------------------------------------------------------------
// 7. F4 (LOW/INFO): byte-identity guard for the protected files
// ---------------------------------------------------------------------------
// The rework must not touch any of the six protected source files or the 16
// contracts. This guard compares the WORKING-TREE blob hash of each protected
// path (git hash-object) against the blob hash stored at both main @ beebfe8
// (the candidate's base) AND current main @ 71b9d41. Any drift fails here.

const BYTE_IDENTITY_BASELINES = ["beebfe8", "71b9d41"];
const PROTECTED_SOURCE_FILES = [
  "src/control/sod-rules.mjs",
  "src/control/risk-registry.mjs",
  "src/control/policy-decision-point.mjs",
  "src/gateway/capability-registry-service.mjs",
  "src/services/goal-graph-service.mjs"
];

function gitBlobHashAtRef(ref, path) {
  return execFileSync("git", ["rev-parse", `${ref}:${path}`], { encoding: "utf8" }).trim();
}
function gitWorkingBlobHash(path) {
  return execFileSync("git", ["hash-object", path], { encoding: "utf8" }).trim();
}
function contractPathsAt(ref) {
  return execFileSync("git", ["ls-tree", "--name-only", ref, "contracts/"], { encoding: "utf8" })
    .split(/\r?\n/).filter((line) => line.endsWith(".json")).sort();
}

test("F4 byte-identity: protected source files are byte-identical to main @ beebfe8 AND @ 71b9d41", () => {
  for (const path of PROTECTED_SOURCE_FILES) {
    const working = gitWorkingBlobHash(path);
    for (const ref of BYTE_IDENTITY_BASELINES) {
      assert.equal(working, gitBlobHashAtRef(ref, path), `${path} drifted from main @ ${ref}`);
    }
  }
});

test("F4 byte-identity: every contracts/*.json is byte-identical to main @ beebfe8 AND @ 71b9d41 (same file set)", () => {
  const baseContracts = contractPathsAt(BYTE_IDENTITY_BASELINES[0]);
  assert.ok(baseContracts.length >= 16, "expected at least 16 contract schemas");
  for (const ref of BYTE_IDENTITY_BASELINES) {
    assert.deepEqual(contractPathsAt(ref), baseContracts, `contract file set differs at main @ ${ref}`);
  }
  for (const path of baseContracts) {
    const working = gitWorkingBlobHash(path);
    for (const ref of BYTE_IDENTITY_BASELINES) {
      assert.equal(working, gitBlobHashAtRef(ref, path), `${path} drifted from main @ ${ref}`);
    }
  }
});
