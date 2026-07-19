import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { ContextFederationService } from "../src/services/context-federation-service.mjs";
import { HandoffService, HandoffServiceError } from "../src/services/handoff-service.mjs";

// P0-11 R2: HandoffService wired to a ContextFederationService receipt
// resolver. context_receipt_ref becomes mandatory (GOV-P011-07) and must
// resolve ALLOW and bind the same (project, wp, session, baseline).

const PROJ = "prj_r2", WP = "wp_r2", BASE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const ENGIN = "eng", REV = "rev", GOV = "gov", SESSION = "ses_src";

function grants() {
  const w = { projectId: PROJ, workPackageId: WP, validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z", status: "ACTIVE" };
  return [
    { ...w, grantId: "g_e", decisionId: "d_e", actorId: ENGIN, roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED", "WorkPackage:AUTHORIZED->READY", "WorkPackage:READY->RUNNING"] },
    { ...w, grantId: "g_r", decisionId: "d_r", actorId: REV, roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] },
    { ...w, grantId: "g_g", decisionId: "d_g", actorId: GOV, roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] }
  ];
}

function sealDoc(over = {}) {
  const base = {
    receipt_id: "rc_r2", version: 1, project_id: PROJ, objective_id: "o", work_package_id: WP,
    session_id: SESSION, assigned_role: "REV", authority_scope: ["src/services"], baseline_version: BASE,
    acceptance_criteria: ["review"], allowed_tools: [], allowed_skills: [], evidence_obligations: ["r"],
    freshness_timestamp: "2026-07-18T10:00:00Z", source_references: ["s1"], ...over
  };
  return { ...base, content_hash: canonicalFingerprint(base) };
}

function handoffEnvelope(over = {}) {
  const base = {
    handoff_id: "ho_r2", version: 1, project_id: PROJ, work_package_id: WP, source_session_id: SESSION,
    destination_role: "REV", objective: "review", authorized_scope: ["read"], work_completed: [], artifacts: [],
    assumptions: [], evidence_refs: ["e"], checks: [], limitations: [], unresolved_findings: [], risks: [],
    recommended_next_action: "review", context_delta: [], ...over
  };
  return { ...base, content_hash: canonicalFingerprint(base) };
}

function harness() {
  let nowMs = Date.parse("2026-07-18T10:00:00Z");
  const clock = () => new Date(nowMs);
  const wp = new WorkPackageContractService({ grants: grants(), now: clock });
  wp.createWorkPackage({
    work_package_id: WP, version: 1, project_id: PROJ, objective: "r2", risk_class: "R2", status: "DRAFT",
    baseline: BASE, scope: ["src/"], non_scope: ["p"], acceptance_criteria: ["ok"], roles: { producer: ENGIN },
    allowed_paths: ["src/services", "tests"], prohibited_paths: ["o"], evidence_obligations: ["self:t"],
    valid_until: "2026-08-01T00:00:00Z"
  }, { idempotencyKey: "c1", actorId: ENGIN, authorityRef: "g_e" });
  let s = 0;
  for (const [st, a, g] of [["PLANNED", ENGIN, "g_e"], ["REVIEWED", REV, "g_r"], ["AUTHORIZED", GOV, "g_g"], ["READY", ENGIN, "g_e"], ["RUNNING", ENGIN, "g_e"]]) {
    wp.submitTransition({ projectId: PROJ, workPackageId: WP, version: 1, requestedState: st, actorId: a, authorityRef: g, policyDecision: "ALLOW", evidence: [{ ref: `e_${st}` }], idempotencyKey: `t_${++s}`, reasonCode: "S" });
  }
  const cfs = new ContextFederationService({ workPackageService: wp, now: clock });
  const src = [{ ref: "s1", projectId: PROJ, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 1 }];
  cfs.issueReceipt({ document: sealDoc(), candidateSources: src, actorId: ENGIN, authorityRef: "g_e", baseline: BASE, idempotencyKey: "iss" });
  // resolver adapter: ContextFederationService.consumeReceipt-shaped
  const receiptResolver = (ref, ctx) => cfs.consumeReceipt(ctx.projectId, ref.receipt_id, { sessionId: ctx.sessionId, actorId: ctx.actorId, baseline: ctx.baseline });
  const handoff = new HandoffService({ workPackageService: wp, receiptResolver, now: clock });
  return { wp, cfs, handoff, clock, setNow: (iso) => { nowMs = Date.parse(iso); } };
}

const offer = (h, over = {}) => h.handoff.offerHandoff({
  envelope: handoffEnvelope(over.envelope), actorId: ENGIN, authorityRef: "g_e", sourceSessionId: SESSION,
  baseline: BASE, ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] },
  idempotencyKey: over.idempotencyKey ?? "o1", contextReceiptRef: over.contextReceiptRef, ...over.request
});

function denies(fn, code) { assert.throws(fn, (e) => e instanceof HandoffServiceError && e.code === code); }

test("R2: a valid bound context receipt admits the handoff offer", () => {
  const h = harness();
  const r = offer(h, { contextReceiptRef: { receipt_id: "rc_r2" } });
  assert.equal(r.state, "OFFERED");
  const led = h.handoff.getHandoffLedger(PROJ, "ho_r2");
  assert.equal(led[0].contextReceiptId, "rc_r2");
});

test("R2: context_receipt_ref is mandatory once a resolver is wired", () => {
  const h = harness();
  denies(() => offer(h, {}), "DENY_RECEIPT_REQUIRED");
});

test("R2: an unknown or revoked receipt does not resolve", () => {
  const h = harness();
  denies(() => offer(h, { contextReceiptRef: { receipt_id: "ghost" } }), "DENY_RECEIPT_NOT_EFFECTIVE");
  h.cfs.revokeReceipt(PROJ, "rc_r2", { actorId: GOV, role: "GOV" });
  denies(() => offer(h, { contextReceiptRef: { receipt_id: "rc_r2" } }), "DENY_RECEIPT_NOT_EFFECTIVE");
});

test("R2: a receipt bound to a different session is rejected", () => {
  const h = harness();
  // handoff from a session the receipt is not bound to
  denies(() => h.handoff.offerHandoff({
    envelope: handoffEnvelope({ source_session_id: "other_ses" }),
    actorId: ENGIN, authorityRef: "g_e", sourceSessionId: "other_ses", baseline: BASE,
    ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] },
    idempotencyKey: "o_sess", contextReceiptRef: { receipt_id: "rc_r2" }
  }), "DENY_RECEIPT_NOT_EFFECTIVE");
});

test("R2: malformed context_receipt_ref is rejected", () => {
  const h = harness();
  denies(() => offer(h, { contextReceiptRef: { receipt_id: "  " } }), "DENY_MALFORMED_REQUEST");
});
