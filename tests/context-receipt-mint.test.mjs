import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { ContractValidationError } from "../src/contracts/contract-validator.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { ContextFederationService, ContextFederationError, mintReceiptDocument } from "../src/services/context-federation-service.mjs";

// MOD-CONTEXT S1: mintReceiptDocument round-trip, parity, determinism, and
// purity proofs. The pre-S1 suite (tests/context-federation.test.mjs) is the
// unmodified parity baseline for every existing issue/verify/consume/compact
// deny path; this file proves the NEW construction path shares the live seal
// surface without changing it.

const PROJECT = "prj_ctx";
const WP = "wp_ctx";
const BASE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const ENGIN = "eng", REV = "rev", GOV = "gov";

function grantsForVersion(version) {
  const suffix = version === 1 ? "" : `_v${version}`;
  const w = { projectId: PROJECT, workPackageId: WP, workPackageVersion: version, validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z", status: "ACTIVE" };
  return [
    { ...w, grantId: `g_e${suffix}`, decisionId: `d_e${suffix}`, actorId: ENGIN, roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED"] },
    { ...w, grantId: `g_r${suffix}`, decisionId: `d_r${suffix}`, actorId: REV, roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] },
    { ...w, grantId: `g_g${suffix}`, decisionId: `d_g${suffix}`, actorId: GOV, roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] }
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

// Manual caller-side seal, exactly as the pre-S1 tests computed it: this is
// the parity oracle proving mint's seal is the same canonical fingerprint.
function seal(doc) {
  const { content_hash, ...body } = doc;
  return { ...doc, content_hash: canonicalFingerprint(body) };
}

// Two survivors plus one excluded candidate per subtractive stage 1-5.
const CANDS = [
  { ref: "s2", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 1 },
  { ref: "s1", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 2 },
  { ref: "x_scope", projectId: "other", classification: "INTERNAL", current: true, verified: true, resolvable: true },
  { ref: "x_class", projectId: PROJECT, classification: "RESTRICTED", current: true, verified: true, resolvable: true },
  { ref: "x_stale", projectId: PROJECT, classification: "INTERNAL", current: false, verified: true, resolvable: true },
  { ref: "x_unverified", projectId: PROJECT, classification: "INTERNAL", current: true, verified: false, resolvable: true },
  { ref: "x_unresolvable", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: false }
];

function mintInput(over = {}) {
  return {
    receipt_id: "rc_m1", project_id: PROJECT, objective_id: "obj_1", work_package_id: WP,
    session_id: "ses_1", assigned_role: "REV", authority_scope: ["src/services"], baseline_version: BASE,
    acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [], evidence_obligations: ["review-report"],
    freshness_timestamp: "2026-07-18T10:00:00Z", candidateSources: CANDS, ...over
  };
}

function harness({ start = "2026-07-18T10:00:00Z" } = {}) {
  let nowMs = Date.parse(start);
  const clock = () => new Date(nowMs);
  const grantSet = grantsForVersion(1);
  const wp = new WorkPackageContractService({ grants: grantSet, authoritySource: () => grantSet, now: clock });
  wp.createWorkPackage(wpDraft(1), { idempotencyKey: "c1", actorId: ENGIN, authorityRef: "g_e" });
  let s = 0;
  for (const [st, a, g] of [["PLANNED", ENGIN, "g_e"], ["REVIEWED", REV, "g_r"], ["AUTHORIZED", GOV, "g_g"]]) {
    wp.submitTransition({ projectId: PROJECT, workPackageId: WP, version: 1, requestedState: st, actorId: a, authorityRef: g, policyDecision: "ALLOW", evidence: [{ ref: `e_1_${st}` }], idempotencyKey: `t_1_${++s}`, reasonCode: "S" });
  }
  const svc = new ContextFederationService({ workPackageService: wp, now: clock });
  const issue = (document, over = {}) => svc.issueReceipt({
    document, candidateSources: over.candidateSources ?? CANDS,
    actorId: ENGIN, authorityRef: "g_e", baseline: BASE, idempotencyKey: over.idempotencyKey ?? `idem_${Math.random()}`, ...over.request
  });
  return { svc, issue };
}

function denies(fn, code, Cls = ContextFederationError) {
  assert.throws(fn, (e) => e instanceof Cls && e.code === code);
}

test("MINT-01 round-trip: a minted document is accepted verbatim by issueReceipt and is consumable", () => {
  const h = harness();
  const minted = mintReceiptDocument(mintInput());
  const issued = h.issue(minted.document, { idempotencyKey: "mint_rt" });
  assert.equal(issued.state, "ISSUED");
  assert.equal(issued.version, 1);
  assert.equal(issued.boundWpVersion, 1);
  // the exclusions mint reports are exactly the exclusions issue records
  assert.deepEqual(issued.exclusions, minted.exclusions);
  const consumed = h.svc.consumeReceipt(PROJECT, "rc_m1", { sessionId: "ses_1", actorId: REV, baseline: BASE });
  assert.equal(consumed.code, "ALLOW");
  assert.deepEqual(consumed.receipt, { ...minted.document });
});

test("MINT-02 parity: mint output is byte-identical to a correct manual caller's sealed document", () => {
  const minted = mintReceiptDocument(mintInput());
  const manual = seal({
    receipt_id: "rc_m1", version: 1, project_id: PROJECT, objective_id: "obj_1", work_package_id: WP,
    session_id: "ses_1", assigned_role: "REV", authority_scope: ["src/services"], baseline_version: BASE,
    acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [], evidence_obligations: ["review-report"],
    freshness_timestamp: "2026-07-18T10:00:00Z", source_references: ["s1", "s2"], content_hash: "0".repeat(64)
  });
  assert.deepEqual({ ...minted.document }, manual);
  assert.equal(minted.document.content_hash, manual.content_hash);
});

test("MINT-03 source_references are exactly the subtractive survivor set, with stage exclusions recorded", () => {
  const minted = mintReceiptDocument(mintInput());
  assert.deepEqual(minted.document.source_references, ["s1", "s2"]);
  assert.deepEqual(
    minted.exclusions.map((x) => [x.ref, x.stage]).sort(),
    [["x_class", "authority-filter"], ["x_scope", "project-scope"], ["x_stale", "temporal"], ["x_unresolvable", "exact-source"], ["x_unverified", "verification"]]
  );
  // minimum-sufficient tail removal participates in minting too
  const trimmed = mintReceiptDocument(mintInput({ minimumSufficient: 1 }));
  assert.deepEqual(trimmed.document.source_references, ["s1"]); // s1 outranks s2
  assert.ok(trimmed.exclusions.some((x) => x.ref === "s2" && x.stage === "minimum-sufficient"));
});

test("MINT-04 determinism: same input mints the same document and seal; candidate order does not change the seal", () => {
  const a = mintReceiptDocument(mintInput());
  const b = mintReceiptDocument(mintInput());
  assert.deepEqual({ ...a.document }, { ...b.document });
  assert.equal(a.document.content_hash, b.document.content_hash);
  const reversed = mintReceiptDocument(mintInput({ candidateSources: [...CANDS].reverse() }));
  assert.equal(reversed.document.content_hash, a.document.content_hash);
});

test("MINT-05 output is deep-frozen", () => {
  const minted = mintReceiptDocument(mintInput());
  assert.throws(() => { minted.document = null; }, TypeError);
  assert.throws(() => { minted.document.receipt_id = "rc_evil"; }, TypeError);
  assert.throws(() => { minted.document.source_references.push("smuggled"); }, TypeError);
  assert.throws(() => { minted.exclusions.push({ ref: "x", stage: "fake", reason: "fake" }); }, TypeError);
});

test("MINT-06 purity: minting alone issues nothing and touches no service state", () => {
  const h = harness();
  mintReceiptDocument(mintInput());
  assert.equal(h.svc.consumeReceipt(PROJECT, "rc_m1", { sessionId: "ses_1", actorId: REV, baseline: BASE }).code, "DENY_UNKNOWN_RECEIPT");
  denies(() => h.svc.getReceipt(PROJECT, "rc_m1"), "DENY_UNKNOWN_RECEIPT");
});

test("MINT-07 tamper-evidence: mutating any minted field without resealing denies DENY_FINGERPRINT_MISMATCH", () => {
  const h = harness();
  const minted = mintReceiptDocument(mintInput());
  // schema-valid mutations of every sealed field, including content_hash itself
  const mutations = {
    receipt_id: "rc_tampered", version: 2, project_id: `${PROJECT}x`, objective_id: "obj_tampered",
    work_package_id: `${WP}x`, session_id: "ses_tampered", assigned_role: "GOV",
    authority_scope: [...minted.document.authority_scope, "tests"], baseline_version: "deadbeef",
    acceptance_criteria: [...minted.document.acceptance_criteria, "tampered"],
    allowed_tools: [...minted.document.allowed_tools, "write"], allowed_skills: ["tampered"],
    evidence_obligations: [...minted.document.evidence_obligations, "tampered"],
    freshness_timestamp: "2026-07-18T10:00:01Z", source_references: [...minted.document.source_references, "s3"],
    content_hash: "f".repeat(64)
  };
  for (const [field, value] of Object.entries(mutations)) {
    denies(() => h.issue({ ...minted.document, [field]: value }), "DENY_FINGERPRINT_MISMATCH");
  }
});

test("MINT-08 resealed tampering still hits the same downstream deny codes as before", () => {
  const h = harness();
  const minted = mintReceiptDocument(mintInput());
  const reseal = (over) => seal({ ...minted.document, ...over });
  denies(() => h.issue(reseal({ version: 2 })), "DENY_NOT_INITIAL_VERSION");
  denies(() => h.issue(reseal({ source_references: ["s1", "s_ghost"] })), "DENY_SOURCE_MISMATCH");
  denies(() => h.issue(reseal({ source_references: ["s1", "s1"] })), "DENY_SOURCE_MISMATCH");
  denies(() => h.issue(reseal({ source_references: ["s1"] })), "DENY_SOURCE_MISMATCH");
  denies(() => h.issue(reseal({ authority_scope: ["outside/root"] })), "DENY_SCOPE_WIDENING");
  denies(() => h.issue(reseal({ baseline_version: "deadbeef" })), "DENY_BASELINE_MISMATCH");
});

test("MINT-09 mint input is fail-closed: unknown keys, bad ceiling, id charset, malformed input", () => {
  denies(() => mintReceiptDocument(null), "DENY_MALFORMED_REQUEST");
  denies(() => mintReceiptDocument([]), "DENY_MALFORMED_REQUEST");
  denies(() => mintReceiptDocument(mintInput({ smuggled: true })), "DENY_MALFORMED_REQUEST");
  denies(() => mintReceiptDocument(mintInput({ version: 2 })), "DENY_MALFORMED_REQUEST");
  denies(() => mintReceiptDocument(mintInput({ content_hash: "0".repeat(64) })), "DENY_MALFORMED_REQUEST");
  denies(() => mintReceiptDocument(mintInput({ classificationCeiling: "ULTRA" })), "DENY_MALFORMED_REQUEST");
  denies(() => mintReceiptDocument(mintInput({ receipt_id: "rc@1" })), "DENY_ID_CHARSET");
});

test("MINT-10 mint fails closed when nothing survives retrieval or intent is schema-incomplete", () => {
  // all candidates excluded -> empty source_references -> schema minItems denies
  denies(() => mintReceiptDocument(mintInput({ candidateSources: CANDS.slice(2) })), "DENY_CONTRACT_INVALID", ContractValidationError);
  // missing required intent field
  denies(() => mintReceiptDocument({ ...mintInput(), session_id: undefined }), "DENY_CONTRACT_INVALID", ContractValidationError);
});
