/**
 * V-020 GOVERNANCE conformance — CANDIDATE (agent-self-activation-denied half).
 *
 * verification-matrix.md (SECB-VERIFY-P0-001) V-020:
 *   positive  : "human decision changes allowed state"
 *   adversarial: "agent self-activation denied"
 *
 * This file covers the SECURITY-CRITICAL adversarial half NOW, by COMPOSING the
 * ratified primitives READ-ONLY and asserting the DENY / structurally-unfillable
 * outcome each real primitive emits. An AGENT (any non-human actor) cannot
 * activate, change the allowed state, self-render a GOV verdict, or promote
 * effectiveness — across every governed surface:
 *
 *   S1 self-pilot GOV slot        -> src/self-pilot/read-only-self-pilot.mjs
 *                                    GOV_DECISION_SLOT is a frozen, operator-only
 *                                    slot the pilot has no code path to fill.
 *   S2 policy-decision-point      -> src/control/policy-decision-point.mjs
 *                                    cannot self-grant human approval; every
 *                                    human-gated risk class denies
 *                                    DENY_HUMAN_APPROVAL_REQUIRED, serverDerived:false.
 *   S3 access-mode ladder         -> src/live/access-mode-policy.mjs
 *                                    Control/Emergency (change/activate) deny
 *                                    without explicit authorization; escalation denies.
 *   S4 approval-binding           -> src/control/approval-binding.mjs
 *                                    a producer cannot be its own independent
 *                                    approver; collapsed actors fail SoD.
 *   S5 authority-engine           -> src/control/authority-engine.mjs
 *                                    an agent grant lacking the human GOV role
 *                                    cannot authorize a Project activation transition.
 *
 * The POSITIVE half ("human decision changes allowed state") requires a REAL
 * human GOV decision plus operator activation — SEC/GOV-gated and OUT OF SCOPE
 * for a candidate. It is kept below as an HONEST, documented pending case
 * ({ skip: true }) that names activation as the blocker and asserts nothing false.
 *
 * DISCIPLINE (identical to the P0-18 conformance harness):
 *   - Composes the REAL ratified primitives READ-ONLY over fixtures. No src/
 *     file is modified (byte-identity guard at the bottom pins every composed
 *     module to its git blob hash at main @ ec5aa76).
 *   - Every adversarial/negative asserts the SPECIFIC deny code the real
 *     primitive emits.
 *
 * SCOPE HONESTY: this is a conformance-COVERAGE candidate for V-020's adversarial
 * half. It is NOT P0-18 sign-off, NOT the P0-20 governance verdict, and NOT
 * activation. See docs/03-project-control/candidates/p0-18-v020-governance-candidate-001.md.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { DurableLedger } from "../src/ledger/durable-ledger.mjs";
import { EventLedger } from "../src/ledger/governed-ledgers.mjs";
import { WorkspaceLeaseLedger } from "../src/ledger/workspace-lease-ledger.mjs";
import { buildSelfPilotFixtures, PILOT_NOW_ISO } from "../src/self-pilot/fixtures.mjs";
import {
  runReadOnlySelfPilot,
  GOV_DECISION_SLOT
} from "../src/self-pilot/read-only-self-pilot.mjs";
import { createPolicyDecisionPoint } from "../src/control/policy-decision-point.mjs";
import {
  evaluateAccessRequest,
  DENY_ACCESS_MODE_UNKNOWN,
  DENY_ACCESS_ESCALATION,
  DENY_ACCESS_AUTHORIZATION_REQUIRED
} from "../src/live/access-mode-policy.mjs";
import {
  evaluateApprovalBinding,
  verifyApprovalBinding
} from "../src/control/approval-binding.mjs";
import { AuthorityEngine } from "../src/control/authority-engine.mjs";

const NUL = String.fromCharCode(0);

// ---------------------------------------------------------------------------
// S1 self-pilot GOV slot: an agent orchestration cannot self-render the GOV
//   verdict. Composes the REAL read-only self-pilot over its fixtures; the GOV
//   decision slot is structurally unfillable and survives injection attempts.
// ---------------------------------------------------------------------------

const pilotNow = () => new Date(PILOT_NOW_ISO);

function withPilotLedgers(operation) {
  const dir = mkdtempSync(join(tmpdir(), "secb-v020-selfpilot-"));
  try {
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const evidenceSealLedger = new DurableLedger({ filePath: join(dir, "evidence-seals.ndjson"), ledgerId: "secb-evidence-seal-ledger" });
    const workspaceLeaseLedger = new WorkspaceLeaseLedger({ filePath: join(dir, "workspace-leases.jsonl") });
    return operation({ eventLedger, evidenceSealLedger, workspaceLeaseLedger });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("V-020 adversarial S1: read-only self-pilot never self-renders a GOV verdict (slot structurally unfillable, injection-proof)", () => {
  withPilotLedgers((ledgers) => {
    const fixtures = buildSelfPilotFixtures({ driveGov: true });
    const trace = runReadOnlySelfPilot({ fixtures, now: pilotNow, ledgers });

    // The completed run leaves the operator-only GOV slot empty: the pilot has
    // no code path that fills verdict/rendered_by — it is the frozen constant.
    assert.equal(trace.completed, true, "chain composes and completes read-only");
    assert.equal(trace.gov_decision, GOV_DECISION_SLOT);
    assert.equal(trace.gov_decision.verdict, null);
    assert.equal(trace.gov_decision.rendered_by, null);
    assert.equal(trace.gov_decision.status, "PENDING_OPERATOR");
    assert.equal(trace.gov_decision.authority, "HUMAN_GOV_REQUIRED");
    assert.equal(trace.gov_decision.effective, false);
    assert.equal(trace.p0_20_verdict_rendered, false);
    assert.equal(trace.activation, false);
    assert.equal(trace.self_authorized, false);

    // The chain step for the GOV slot records the operator-only authority, not
    // an agent-rendered verdict.
    const govStep = trace.steps.find((s) => s.step === "GOV_DECISION_SLOT");
    assert.equal(govStep.detail.authority, "HUMAN_GOV_REQUIRED");
    assert.equal(govStep.detail.rendered_by, null);

    // Injection attempt: a hostile actor tries to stamp an agent verdict onto
    // the frozen slot. The deep-frozen slot silently refuses the write; the
    // slot stays null/unfillable.
    assert.equal(Object.isFrozen(GOV_DECISION_SLOT), true);
    assert.throws(
      () => { "use strict"; GOV_DECISION_SLOT.verdict = "ACTIVATE"; },
      TypeError
    );
    try { GOV_DECISION_SLOT.rendered_by = "agent-immune-01"; } catch { /* frozen */ }
    assert.equal(GOV_DECISION_SLOT.verdict, null, "verdict remains null after injection");
    assert.equal(GOV_DECISION_SLOT.rendered_by, null, "renderer remains null after injection");
  });
});

// ---------------------------------------------------------------------------
// S2 policy-decision-point: an agent cannot self-grant human approval.
//   Every collaborator is driven to ALLOW EXCEPT the terminal human-approval
//   gate; a human-gated risk class (the risk class an activation carries) always
//   denies DENY_HUMAN_APPROVAL_REQUIRED, and the envelope is serverDerived:false.
// ---------------------------------------------------------------------------

// Resolvers that pass identity, contract, grant, and SoD — the maximal authority
// an AGENT could ever assemble for itself. The only thing it cannot manufacture
// is a human approval.
function agentDrivenResolvers() {
  return {
    identityResolver: (actorId) => ({ resolved: true, quarantined: false, identity: { agent_instance_id: actorId } }),
    contractResolver: () => ({ allowed: true, state: "ACTIVE" }),
    grantResolver: () => ({ allowed: true, decisionId: "dec_agent_grant_001", roles: ["ENGIN"], history: { producer: "someone-else" } }),
    now: () => new Date("2026-07-21T00:00:00Z")
  };
}

function activationRequest(overrides = {}) {
  return {
    actor_id: "agent-engin-01",
    role: "ENGIN",
    action: "transition",
    target: { entity: "Project", transition: "APPROVED_NOT_EFFECTIVE->ACTIVE" },
    risk_class: "R3",
    mutation_class: "M3",
    context: { project_id: "prj_secb_local", work_package_id: "wp_v020", session_id: "ses_v020_001" },
    ...overrides
  };
}

test("V-020 adversarial S2: policy-decision-point cannot self-grant human approval — human-gated activation denies DENY_HUMAN_APPROVAL_REQUIRED", () => {
  const pdp = createPolicyDecisionPoint(agentDrivenResolvers());
  // R3 and R4 are the human-approval risk classes (risk-registry humanApproval:true).
  for (const [risk_class, mutation_class] of [["R3", "M3"], ["R4", "M5"]]) {
    const result = pdp.decide(activationRequest({ risk_class, mutation_class }));
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_HUMAN_APPROVAL_REQUIRED", `${risk_class} must require human approval`);
    // The PDP can never mint a server-derived authority binding: the actor is
    // caller-supplied, so agent-asserted authority is never treated as derived.
    assert.equal(result.serverDerived, false);
  }
});

// ---------------------------------------------------------------------------
// S3 access-mode ladder: the writable/destructive modes that change allowed
//   state (Control = enter terminal/runtime input; Emergency = pause/terminate/
//   quarantine/revoke) require explicit authorization; an agent without it is
//   denied, and any escalation above the granted rank is denied.
// ---------------------------------------------------------------------------

test("V-020 adversarial S3: access-mode gated modes deny without explicit authorization; escalation denied", () => {
  // Control granted but NO explicit authorization and no humanApproval:false
  // risk class -> the doctrine gate denies.
  const control = evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Control" });
  assert.equal(control.ok, false);
  assert.equal(control.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);

  // Emergency (activate/terminate/quarantine) likewise denies without attestation.
  const emergency = evaluateAccessRequest({ requestedMode: "Emergency", grantedMode: "Emergency" });
  assert.equal(emergency.ok, false);
  assert.equal(emergency.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);

  // An agent holding only read-only Observe cannot escalate to a change-state mode.
  const escalate = evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Observe" });
  assert.equal(escalate.ok, false);
  assert.equal(escalate.code, DENY_ACCESS_ESCALATION);

  // A human-gated risk class does NOT waive the attestation (R3 humanApproval:true).
  const gatedRisk = evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Control", riskClass: "R3" });
  assert.equal(gatedRisk.ok, false);
  assert.equal(gatedRisk.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);
});

// ---------------------------------------------------------------------------
// S4 approval-binding: an agent cannot approve its own activation. The producer
//   cannot hold the independent-review leg (self-approval), and collapsing the
//   governance leg onto the producer or a single actor fails the SoD gate.
// ---------------------------------------------------------------------------

const wellFormed = (role, actor_id) => ({ role, actor_id, decided_at: "2026-07-21T00:00:00Z" });

test("V-020 adversarial S4: approval-binding rejects producer==approver (self-approval) and collapsed-actor SoD", () => {
  const producer = "agent-immune-01";

  // The agent producer supplies ITSELF as the independent-review approver.
  const selfApprove = evaluateApprovalBinding({
    approvals: [wellFormed("independent_review", producer), wellFormed("governance", "human-gov-01")],
    producerActorId: producer
  });
  assert.equal(selfApprove.ok, false);
  assert.equal(selfApprove.code, "DENY_SELF_APPROVAL");

  // A single non-producer actor holds BOTH legs -> pairwise-distinctness fails.
  const collapsed = evaluateApprovalBinding({
    approvals: [wellFormed("independent_review", "agent-buddy-01"), wellFormed("governance", "agent-buddy-01")],
    producerActorId: producer
  });
  assert.equal(collapsed.ok, false);
  assert.equal(collapsed.code, "DENY_SOD_VIOLATION");

  // verifyApprovalBinding fail-closed: a non-GOVERNANCE / non-APPROVAL_BOUND
  // decision (e.g. an agent-forged AUTHORITY record) cannot authorize the action.
  const forgedDecision = {
    decision_type: "AUTHORITY",
    outcome: "ALLOW",
    evidence_refs: [`approval-binding:${JSON.stringify(["ACTIVATE", "1"])}`]
  };
  const verify = verifyApprovalBinding(forgedDecision, { exactAction: "ACTIVATE", objectVersion: "1" });
  assert.equal(verify.ok, false);
  assert.equal(verify.code, "DENY_WRONG_DECISION_TYPE");
});

// ---------------------------------------------------------------------------
// S5 authority-engine: an agent grant lacking the human GOV role cannot
//   authorize a Project activation transition (Project:*->ACTIVE requires GOV).
// ---------------------------------------------------------------------------

const V020_NOW = () => new Date("2026-07-21T00:00:00Z");

function agentGrant(overrides = {}) {
  return {
    grantId: "g_agent_v020",
    decisionId: "dec_agent_v020",
    actorId: "agent-engin-01",
    projectId: "prj_secb_local",
    workPackageId: "wp_v020",
    roles: ["ENGIN"],
    allowedTransitions: ["Project:APPROVED_NOT_EFFECTIVE->ACTIVE"],
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    status: "ACTIVE",
    ...overrides
  };
}

function activationContext(overrides = {}) {
  return {
    objectType: "Project",
    currentState: "APPROVED_NOT_EFFECTIVE",
    requestedState: "ACTIVE",
    actorId: "agent-engin-01",
    projectId: "prj_secb_local",
    workPackageId: "wp_v020",
    authorityRef: "g_agent_v020",
    ...overrides
  };
}

test("V-020 adversarial S5: authority-engine denies an agent-granted Project activation lacking the human GOV role", () => {
  // The agent's grant carries ENGIN (an agent role), not GOV. Project activation
  // requires GOV -> the engine refuses to derive the activation authority.
  const engine = new AuthorityEngine({ grants: [agentGrant()], now: V020_NOW });
  const result = engine.authorize(activationContext());
  assert.equal(result.allowed, false);
  assert.equal(result.code, "DENY_AUTHORITY");
  assert.match(result.reason, /does not assign required role GOV/);
});

// ---------------------------------------------------------------------------
// NEGATIVE: a forged / malformed "activation" attempt -> the real deny code.
// ---------------------------------------------------------------------------

test("V-020 negative: forged/malformed activation attempts fail closed with the real primitive's deny code", () => {
  // A forged access mode token ("Activate" is not a ladder mode) -> UNKNOWN,
  // never coerced onto a nearby mode.
  const forgedMode = evaluateAccessRequest({ requestedMode: "Activate", grantedMode: "Emergency" });
  assert.equal(forgedMode.ok, false);
  assert.equal(forgedMode.code, DENY_ACCESS_MODE_UNKNOWN);

  // A malformed PDP request smuggling an unknown field -> deny-by-default,
  // no agent-crafted extra factor is honoured.
  const pdp = createPolicyDecisionPoint(agentDrivenResolvers());
  const malformed = pdp.decide({ ...activationRequest(), self_activate: true });
  assert.equal(malformed.decision, "DENY");
  assert.equal(malformed.code, "DENY_MALFORMED_REQUEST");
  assert.equal(malformed.serverDerived, false);

  // A forged approval bundle (empty / missing legs) -> DENY_APPROVALS.
  const forgedApprovals = evaluateApprovalBinding({ approvals: [], producerActorId: "agent-engin-01" });
  assert.equal(forgedApprovals.ok, false);
  assert.equal(forgedApprovals.code, "DENY_APPROVALS");
});

// ---------------------------------------------------------------------------
// POSITIVE (honest pending): "human decision changes allowed state".
//   Requires a REAL human GOV decision + operator activation — SEC/GOV-gated
//   and OUT OF SCOPE for this candidate. Kept as a documented pending case that
//   names the blocker and asserts nothing false. Do NOT fabricate a human
//   approval to make this pass.
// ---------------------------------------------------------------------------

test(
  "V-020 positive (PENDING — activation-gated): human GOV decision changes allowed state",
  { skip: "Requires a real human GOV decision + operator activation (SEC/GOV-gated). Covering it here would self-authorize activation — a hard block. Blocker: the P0-20 governance verdict + operator activation are OUT OF SCOPE for this candidate." },
  () => {
    // Intentionally empty: this half is activation-dependent. Asserting a
    // human-decision-changes-state outcome would require fabricating a human
    // approval, which the candidate refuses to do. The adversarial half above
    // (agent self-activation denied) is what is testable and covered NOW.
    assert.fail("unreachable: activation-gated positive half is out of scope");
  }
);

// ---------------------------------------------------------------------------
// Byte-identity guard (main @ ec5aa76)
//   Proves every primitive this candidate composes is unmodified. If any pinned
//   blob drifts, the candidate has silently mutated a primitive and this fails.
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

// Directly-composed primitives + their load-bearing dependencies, pinned to
// `git rev-parse ec5aa76:<file>`.
const PINNED_BLOBS = Object.freeze({
  "src/self-pilot/read-only-self-pilot.mjs": "83a1e3595ae965f3af5c153641d5a4c6334c5061",
  "src/self-pilot/fixtures.mjs": "1182198885e6459bbbe80b1f99bc1eaa6721b77a",
  // Repinned by mod-gov-s3-pdp-grant-shape-fix-001 (4 rounds of grant-shape
  // validation hardening, see mod-gov-s3-pdp-grant-shape-fix-producer-verification-001.md).
  "src/control/policy-decision-point.mjs": "81e6eb67e30d6b424884711d9520088709a7e8d2",
  "src/live/access-mode-policy.mjs": "5d96eec7af6e717218a81ea5563e09c6b18d191b",
  "src/control/approval-binding.mjs": "bb6275d553087bbafac3fd234230e0bc6f82048c",
  "src/control/authority-engine.mjs": "05706bd0d47e588c1cd78e6e13841fadbe5c5e58",
  "src/control/sod-rules.mjs": "4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530",
  "src/control/risk-registry.mjs": "b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816",
  "src/ledger/durable-ledger.mjs": "6be08fc14ff31a7c871c5e86888af42285d40529",
  "src/ledger/governed-ledgers.mjs": "32ff590386574311ff5fcdce846b40bcfe2a1f07",
  "src/ledger/workspace-lease-ledger.mjs": "7c0251727ffd516d2e1b5251efeb2d2f2e9525e0"
});

test("V-020 byte-identity: every primitive composed by this candidate is unchanged vs main @ ec5aa76", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} blob-identical to main @ ec5aa76`);
  }
});
