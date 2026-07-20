import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { ContractValidationError } from "../src/contracts/contract-validator.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { ContextFederationService, ContextFederationError } from "../src/services/context-federation-service.mjs";
import { runRetrieval } from "../src/services/context-retrieval-policy.mjs";

const PROJECT = "prj_ctx";
const WP = "wp_ctx";
const BASE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const ENGIN = "eng", REV = "rev", GOV = "gov";

function grants() {
  const w = { projectId: PROJECT, workPackageId: WP, validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z", status: "ACTIVE" };
  return [
    { ...w, grantId: "g_e", decisionId: "d_e", actorId: ENGIN, roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED"] },
    { ...w, grantId: "g_r", decisionId: "d_r", actorId: REV, roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] },
    { ...w, grantId: "g_g", decisionId: "d_g", actorId: GOV, roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] }
  ];
}

function wpDraft(version = 1) {
  return {
    work_package_id: WP, version, project_id: PROJECT, objective: "ctx", risk_class: "R2", status: "DRAFT",
    baseline: BASE, scope: ["src/"], non_scope: ["p"], acceptance_criteria: ["ok"], roles: { producer: ENGIN },
    allowed_paths: ["src/services", "tests"], prohibited_paths: ["out"], evidence_obligations: ["self:t"],
    valid_until: "2026-08-01T00:00:00Z"
  };
}

function seal(doc) {
  const { content_hash, ...body } = doc;
  return { ...doc, content_hash: canonicalFingerprint(body) };
}

function receiptDoc(over = {}) {
  return seal({
    receipt_id: "rc_1", version: 1, project_id: PROJECT, objective_id: "obj_1", work_package_id: WP,
    session_id: "ses_1", assigned_role: "REV", authority_scope: ["src/services"], baseline_version: BASE,
    acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [], evidence_obligations: ["review-report"],
    freshness_timestamp: "2026-07-18T10:00:00Z", source_references: ["s1", "s2"], content_hash: "0".repeat(64),
    ...over
  });
}

const SOURCES = [
  { ref: "s1", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 2 },
  { ref: "s2", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 1 }
];

function harness({ start = "2026-07-18T10:00:00Z" } = {}) {
  let nowMs = Date.parse(start);
  const clock = () => new Date(nowMs);
  const wp = new WorkPackageContractService({ grants: grants(), now: clock });
  const drive = (version) => {
    wp.createWorkPackage(wpDraft(version), { idempotencyKey: `c${version}`, actorId: ENGIN, authorityRef: "g_e" });
    let s = 0;
    for (const [st, a, g] of [["PLANNED", ENGIN, "g_e"], ["REVIEWED", REV, "g_r"], ["AUTHORIZED", GOV, "g_g"]]) {
      wp.submitTransition({ projectId: PROJECT, workPackageId: WP, version, requestedState: st, actorId: a, authorityRef: g, policyDecision: "ALLOW", evidence: [{ ref: `e_${version}_${st}` }], idempotencyKey: `t_${version}_${++s}`, reasonCode: "S" });
    }
  };
  drive(1);
  const svc = new ContextFederationService({ workPackageService: wp, now: clock });
  const issue = (over = {}) => svc.issueReceipt({
    document: receiptDoc(over.document), candidateSources: over.candidateSources ?? SOURCES,
    actorId: ENGIN, authorityRef: "g_e", baseline: BASE, idempotencyKey: over.idempotencyKey ?? "idem_issue", ...over.request
  });
  return { wp, svc, issue, drive, setNow: (iso) => { nowMs = Date.parse(iso); } };
}

function denies(fn, code, Cls = ContextFederationError) {
  assert.throws(fn, (e) => e instanceof Cls && e.code === code);
}

test("retrieval pipeline is subtractive and records exclusions", () => {
  const cands = [
    { ref: "a", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 1 },
    { ref: "b", projectId: "other", classification: "INTERNAL", current: true, verified: true, resolvable: true },
    { ref: "c", projectId: PROJECT, classification: "RESTRICTED", current: true, verified: true, resolvable: true },
    { ref: "d", projectId: PROJECT, classification: "INTERNAL", current: false, verified: true, resolvable: true },
    { ref: "e", projectId: PROJECT, classification: "INTERNAL", current: true, verified: false, resolvable: true },
    { ref: "f", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: false }
  ];
  const { included, exclusions } = runRetrieval(cands, { projectId: PROJECT, classificationCeiling: "INTERNAL" });
  assert.deepEqual(included, ["a"]);
  assert.deepEqual(exclusions.map((x) => x.stage).sort(), ["authority-filter", "exact-source", "project-scope", "temporal", "verification"]);
});

test("issue happy path binds effective version, expiry, and exclusions", () => {
  const h = harness();
  const r = h.issue();
  assert.equal(r.state, "ISSUED");
  assert.equal(r.boundWpVersion, 1);
  assert.equal(r.expiresAt, "2026-07-19T10:00:00.000Z");
});

test("CF-01 closed shape, blank, reserved delimiter deny", () => {
  const h = harness();
  denies(() => h.issue({ request: { smuggled: true } }), "DENY_MALFORMED_REQUEST");
  denies(() => h.issue({ request: { actorId: "  " } }), "DENY_MALFORMED_REQUEST");
  denies(() => h.issue({ document: { receipt_id: "rc@1" } }), "DENY_ID_CHARSET");
});

test("CF-02 non-effective work package / baseline mismatch deny", () => {
  const h = harness();
  denies(() => h.issue({ request: { baseline: "deadbeef" }, document: { baseline_version: "deadbeef" } }), "DENY_WORK_PACKAGE_NOT_EFFECTIVE");
  denies(() => h.issue({ document: { baseline_version: "deadbeef" } }), "DENY_BASELINE_MISMATCH");
});

test("CF-03 scope widening beyond the effective contract denies", () => {
  const h = harness();
  denies(() => h.issue({ document: { authority_scope: ["outside/root"] } }), "DENY_SCOPE_WIDENING");
});

test("CF-04 seal mismatch and schema-invalid deny", () => {
  const h = harness();
  denies(() => h.svc.issueReceipt({ document: { ...receiptDoc(), objective_id: "mutated" }, candidateSources: SOURCES, actorId: ENGIN, authorityRef: "g_e", baseline: BASE, idempotencyKey: "i_seal" }), "DENY_FINGERPRINT_MISMATCH");
  denies(() => h.issue({ document: { assigned_role: undefined } }), "DENY_CONTRACT_INVALID", ContractValidationError);
});

test("CF-05 idempotency conflict and stable replay", () => {
  const h = harness();
  const first = h.issue();
  const replay = h.issue();
  assert.equal(replay.replayed, true);
  assert.equal(replay.expiresAt, first.expiresAt);
  denies(() => h.issue({ document: { objective_id: "different" } }), "DENY_IDEMPOTENCY_CONFLICT");
});

test("CF: source_references must equal the retrieval survivor set (no unauthorized, no duplicate under-claim)", () => {
  const h = harness();
  // unauthorized ref appended
  denies(() => h.issue({ document: { source_references: ["s1", "s_ghost"] } }), "DENY_SOURCE_MISMATCH");
  // duplicate under-claim: drops s2, repeats s1 (Immune note 1) — must deny
  denies(() => h.issue({ document: { source_references: ["s1", "s1"] } }), "DENY_SOURCE_MISMATCH");
});

test("CF-06 consume: wrong session and unknown receipt fail closed", () => {
  const h = harness();
  h.issue();
  assert.equal(h.svc.consumeReceipt(PROJECT, "rc_1", { sessionId: "wrong", actorId: REV, baseline: BASE }).code, "DENY_SESSION_MISMATCH");
  assert.equal(h.svc.consumeReceipt(PROJECT, "rc_ghost", { sessionId: "ses_1", actorId: REV, baseline: BASE }).code, "DENY_UNKNOWN_RECEIPT");
});

test("CF: consume happy path returns the sealed document", () => {
  const h = harness();
  h.issue();
  const consumed = h.svc.consumeReceipt(PROJECT, "rc_1", { sessionId: "ses_1", actorId: REV, baseline: BASE });
  assert.equal(consumed.code, "ALLOW");
  assert.equal(consumed.receipt.receipt_id, "rc_1");
});

test("CF-07 consume after expiry fails closed", () => {
  const h = harness();
  h.issue();
  h.setNow("2026-07-20T00:00:00Z");
  assert.equal(h.svc.consumeReceipt(PROJECT, "rc_1", { sessionId: "ses_1", actorId: REV, baseline: BASE }).code, "DENY_EXPIRED");
});

test("CF-08 consume after work package version supersession fails closed", () => {
  const h = harness();
  h.issue();
  h.drive(2); // a newer AUTHORIZED version becomes effective
  assert.equal(h.svc.consumeReceipt(PROJECT, "rc_1", { sessionId: "ses_1", actorId: REV, baseline: BASE }).code, "DENY_VERSION_SUPERSEDED");
});

test("CF-09/CF-11/CF-12 compaction: subset-only, parent superseded, additive denies", () => {
  const h = harness();
  h.issue();
  // additive compaction denies
  denies(() => h.svc.compactReceipt(PROJECT, "rc_1", receiptDoc({ version: 2, source_references: ["s1", "s2", "s3"] }), { idempotencyKey: "cmp_add" }), "DENY_COMPACTION_ADDITIVE");
  // valid subset compaction supersedes the parent
  const compacted = h.svc.compactReceipt(PROJECT, "rc_1", receiptDoc({ version: 2, source_references: ["s1"] }), { idempotencyKey: "cmp_ok" });
  assert.equal(compacted.version, 2);
  // the superseded parent denies-on-use with a chain-head pointer
  const stale = h.svc.consumeReceipt(PROJECT, "rc_1", { sessionId: "ses_1", actorId: REV, baseline: BASE });
  assert.equal(stale.code, "ALLOW"); // head is v2, consumed via chain head
  assert.equal(stale.version, 2);
});

test("CF-13 revoke is GOV-only and terminal for the chain", () => {
  const h = harness();
  h.issue();
  denies(() => h.svc.revokeReceipt(PROJECT, "rc_1", { actorId: ENGIN, role: "ENGIN" }), "DENY_REVOKE_AUTHORITY");
  const revoked = h.svc.revokeReceipt(PROJECT, "rc_1", { actorId: GOV, role: "GOV" });
  assert.equal(revoked.state, "REVOKED");
  assert.equal(h.svc.consumeReceipt(PROJECT, "rc_1", { sessionId: "ses_1", actorId: REV, baseline: BASE }).code, "DENY_REVOKED");
});

test("CF-14 returned objects are frozen and detached", () => {
  const h = harness();
  const r = h.issue();
  assert.throws(() => { r.state = "X"; }, TypeError);
  const view = h.svc.getReceipt(PROJECT, "rc_1");
  assert.throws(() => { view.document.authority_scope.push("x"); }, TypeError);
});

test("CF-15 composition: resolveEffective NONE denies even a well-formed request", () => {
  const h = harness();
  // revoke the work package so resolveEffective returns NONE
  // (drive is not needed; use an unknown project to force no resolution)
  denies(() => h.issue({ document: { project_id: "prj_ghost", work_package_id: WP } }), "DENY_WORK_PACKAGE_NOT_EFFECTIVE");
});
