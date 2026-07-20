import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { HandoffService, HandoffServiceError } from "../src/services/handoff-service.mjs";
import { withinCeiling } from "../src/services/non-escalation-comparator.mjs";

const PROJECT = "prj_secb_local";
const WP = "wp_handoff_001";
const BASELINE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const ENGIN = "engin-actor";
const REV = "rev-actor";
const REV2 = "rev-actor-2";
const GOV = "gov-actor";

function grants() {
  const window = { projectId: PROJECT, workPackageId: WP, workPackageVersion: 1, validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z", status: "ACTIVE" };
  return [
    { ...window, grantId: "g_engin", decisionId: "d_engin", actorId: ENGIN, roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED", "WorkPackage:AUTHORIZED->READY", "WorkPackage:READY->RUNNING"] },
    { ...window, grantId: "g_rev", decisionId: "d_rev", actorId: REV, roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] },
    { ...window, grantId: "g_gov", decisionId: "d_gov", actorId: GOV, roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] }
  ];
}

function draft() {
  return {
    work_package_id: WP, version: 1, project_id: PROJECT,
    objective: "handoff R1 conformance", risk_class: "R2", status: "DRAFT", baseline: BASELINE,
    scope: ["src/services/"], non_scope: ["production"], acceptance_criteria: ["handoff works"],
    roles: { producer: ENGIN }, allowed_paths: ["src/services", "tests"], prohibited_paths: ["outside"],
    evidence_obligations: ["self:unit"], valid_until: "2026-08-01T00:00:00Z"
  };
}

function seal(envelope) {
  const { content_hash, ...body } = envelope;
  return { ...envelope, content_hash: canonicalFingerprint(body) };
}

function envelope(overrides = {}) {
  return seal({
    handoff_id: "ho_1", version: 1, project_id: PROJECT, work_package_id: WP,
    source_session_id: "ses_src", destination_role: "REV",
    objective: "independent review", authorized_scope: ["read"],
    work_completed: [], artifacts: [], assumptions: [], evidence_refs: ["ev_1"],
    checks: [], limitations: [], unresolved_findings: [], risks: [],
    recommended_next_action: "review", context_delta: [],
    content_hash: "0".repeat(64),
    ...overrides
  });
}

function harness({ start = "2026-07-18T10:00:00Z" } = {}) {
  let nowMs = Date.parse(start);
  const clock = () => new Date(nowMs);
  const grantSet = grants();
  const wp = new WorkPackageContractService({ grants: grantSet, authoritySource: () => grantSet, now: clock });
  // drive the work package to RUNNING under ENGIN (effective; executor=ENGIN)
  wp.createWorkPackage(draft(), { idempotencyKey: "c1", actorId: ENGIN, authorityRef: "g_engin" });
  const steps = [
    ["PLANNED", ENGIN, "g_engin"], ["REVIEWED", REV, "g_rev"], ["AUTHORIZED", GOV, "g_gov"],
    ["READY", ENGIN, "g_engin"], ["RUNNING", ENGIN, "g_engin"]
  ];
  let seq = 0;
  for (const [state, actorId, authorityRef] of steps) {
    wp.submitTransition({ projectId: PROJECT, workPackageId: WP, version: 1, requestedState: state, actorId, authorityRef, policyDecision: "ALLOW", evidence: [{ ref: `ev_${state}` }], idempotencyKey: `t_${++seq}`, reasonCode: "STEP" });
  }
  const handoff = new HandoffService({ workPackageService: wp, now: clock });
  const setNow = (iso) => { nowMs = Date.parse(iso); };
  const offer = (over = {}) => handoff.offerHandoff({
    envelope: envelope(over.envelope), actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src",
    baseline: BASELINE, ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] },
    idempotencyKey: over.idempotencyKey ?? "idem_offer_1", ...over.request
  });
  return { wp, handoff, offer, setNow };
}

function denies(fn, code) {
  assert.throws(fn, (e) => e instanceof HandoffServiceError && e.code === code);
}

test("comparator: within-ceiling on every dimension, incomparable denies", () => {
  const bound = { riskClass: "R3", dataClassification: "CONFIDENTIAL", paths: ["src"], tools: ["read", "write"], transitions: ["a->b"] };
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/x"], tools: ["read"], transitions: [] }, bound).ok, true);
  assert.equal(withinCeiling({ riskClass: "R4", dataClassification: "INTERNAL", paths: [], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "SECRET", paths: [], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION_UNCOMPARABLE");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["other"], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/../etc"], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION_UNCOMPARABLE");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: [], tools: ["exec*"], transitions: [] }, bound).code, "DENY_ESCALATION_UNCOMPARABLE");
});

test("two-phase happy path: offer then independent accept", () => {
  const h = harness();
  const offered = h.offer();
  assert.equal(offered.state, "OFFERED");
  assert.deepEqual(offered.contractSilentDimensions, ["dataClassification", "tools", "transitions"]);
  const accepted = h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "ses_rev", baseline: BASELINE, idempotencyKey: "idem_acc_1" });
  assert.equal(accepted.state, "ACCEPTED");
  assert.equal(accepted.effectiveCeiling.riskClass, "R2");
  assert.equal(h.handoff.getHandoff(PROJECT, "ho_1").state, "ACCEPTED");
});

test("non-escalation: a path outside the effective contract is denied", () => {
  const h = harness();
  denies(() => h.offer({ request: { ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["outside/secret"], tools: [], transitions: [] } } }), "DENY_ESCALATION");
});

test("non-escalation: a risk class above the contract is denied", () => {
  const h = harness();
  denies(() => h.offer({ request: { ceiling: { riskClass: "R4", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] } } }), "DENY_ESCALATION");
});

test("SoD: the executor cannot accept its own independence-bearing handoff", () => {
  const h = harness();
  h.offer();
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: ENGIN, authorityRef: "g_engin", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_sod" }), "DENY_SOD");
});

test("receipts: a context_receipt_ref with no resolver (R1) is denied", () => {
  const h = harness();
  denies(() => h.offer({ request: { contextReceiptRef: { receipt_id: "r1", version: 1, content_hash: "x" } } }), "DENY_RECEIPT_UNVERIFIABLE");
});

test("reserved delimiter in a handoff id field is denied", () => {
  const h = harness();
  denies(() => h.offer({ envelope: { handoff_id: "ho@1" } }), "DENY_ID_CHARSET");
});

test("seal: a tampered envelope whose content_hash does not match is denied", () => {
  const h = harness();
  denies(() => h.handoff.offerHandoff({
    envelope: { ...envelope(), objective: "mutated-after-seal" },
    actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src", baseline: BASELINE,
    ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] },
    idempotencyKey: "idem_seal"
  }), "DENY_FINGERPRINT_MISMATCH");
});

test("expiry: acceptance after the offer expires is denied", () => {
  const h = harness();
  h.offer();
  h.setNow("2026-07-20T00:00:00Z");
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_exp" }), "DENY_EXPIRED");
});

test("baseline: acceptance asserting a different baseline is denied", () => {
  const h = harness();
  h.offer();
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: "deadbeef", idempotencyKey: "idem_base" }), "DENY_BASELINE_MISMATCH");
});

test("single acceptance: a second accept is denied; identical replay is stable", () => {
  const h = harness();
  h.offer();
  const first = h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_once" });
  const replay = h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_once" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.acceptedAt, first.acceptedAt);
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV2, authorityRef: "g_rev", sessionId: "s2", baseline: BASELINE, idempotencyKey: "idem_twice" }), "DENY_NOT_OFFERED");
});

test("idempotency: same offer key + different envelope is a conflict", () => {
  const h = harness();
  h.offer();
  denies(() => h.offer({ envelope: { objective: "different" } }), "DENY_IDEMPOTENCY_CONFLICT");
});

test("revoke is terminal and blocks later acceptance; decline likewise", () => {
  const h = harness();
  h.offer();
  const revoked = h.handoff.revokeHandoff(PROJECT, "ho_1", { actorId: ENGIN });
  assert.equal(revoked.state, "REVOKED");
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_rev_acc" }), "DENY_NOT_OFFERED");
});

test("duplicate handoff id and unknown handoff are denied", () => {
  const h = harness();
  h.offer();
  denies(() => h.offer({ idempotencyKey: "idem_dup" }), "DENY_DUPLICATE_HANDOFF");
  denies(() => h.handoff.getHandoff(PROJECT, "ho_ghost"), "DENY_UNKNOWN_HANDOFF");
});

test("returned records are frozen and detached", () => {
  const h = harness();
  const offered = h.offer();
  assert.throws(() => { offered.state = "ACCEPTED"; }, TypeError);
});
