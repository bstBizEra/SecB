import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { runRetrieval } from "../src/services/context-retrieval-policy.mjs";
import {
  normalizeCandidateSources, CandidateSourcePortError,
  CANDIDATE_SOURCE_KINDS, PORT_STAGE, PORT_EXCLUSION_REASONS
} from "../src/services/candidate-source-port.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { ContextFederationService, ContextFederationError, mintReceiptDocument } from "../src/services/context-federation-service.mjs";

// MOD-CONTEXT S2: typed CandidateSource provider port (gap G4 interface) +
// opt-in exclusions digest (gap G3 provenance). All additive: the pre-S2
// suites (tests/context-federation.test.mjs, tests/context-receipt-mint.
// test.mjs) run unmodified as the parity baseline; this file proves the
// OPT-IN paths only.

const PROJECT = "prj_ctx";
const WP = "wp_ctx";
const BASE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const ENGIN = "eng", REV = "rev", GOV = "gov";

// ——— typed provider-port fixtures ———

function typedSource(over = {}) {
  return {
    id: "s1", kind: "knowledge", project_id: PROJECT, classification: "INTERNAL",
    verified: true, current: true, resolvable: true, relevance: 2,
    provenance: { origin: "mod-know://claims/s1", retrieved_at: "2026-07-18T09:00:00Z", content_hash: "a".repeat(64) },
    ...over
  };
}

const TYPED_OK = [
  typedSource({ id: "s2", relevance: 1, provenance: { origin: "mod-mem://work/s2", retrieved_at: "2026-07-18T09:00:00Z" } }),
  typedSource() // s1, outranks s2
];

// ——— mint/issue harness (same shape as the S1 mint tests) ———

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

function mintInput(over = {}) {
  return {
    receipt_id: "rc_p1", project_id: PROJECT, objective_id: "obj_1", work_package_id: WP,
    session_id: "ses_1", assigned_role: "REV", authority_scope: ["src/services"], baseline_version: BASE,
    acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [], evidence_obligations: ["review-report"],
    freshness_timestamp: "2026-07-18T10:00:00Z", ...over
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
  const issue = (document, candidateSources, over = {}) => svc.issueReceipt({
    document, candidateSources,
    actorId: ENGIN, authorityRef: "g_e", baseline: BASE, idempotencyKey: over.idempotencyKey ?? `idem_${Math.random()}`
  });
  return { svc, issue };
}

function denies(fn, code, Cls = ContextFederationError) {
  assert.throws(fn, (e) => e instanceof Cls && e.code === code);
}

// ——— provider port ———

test("PORT-01 well-formed typed sources normalize to the canonical runRetrieval candidate shape", () => {
  const out = normalizeCandidateSources(TYPED_OK);
  assert.equal(out.exclusions.length, 0);
  assert.deepEqual(out.candidates.map((c) => c.ref), ["s2", "s1"]); // input order preserved
  const [s2, s1] = out.candidates;
  assert.deepEqual(s1, {
    ref: "s1", projectId: PROJECT, classification: "INTERNAL",
    verified: true, current: true, resolvable: true, relevance: 2,
    kind: "knowledge",
    provenance: { origin: "mod-know://claims/s1", retrieved_at: "2026-07-18T09:00:00Z", content_hash: "a".repeat(64) }
  });
  // optional fields normalize deterministically: no content_hash key, relevance defaulted
  const min = normalizeCandidateSources([typedSource({ id: "s3", relevance: undefined, provenance: { origin: "o", retrieved_at: "2026-07-18T09:00:00Z" } })]);
  assert.equal(min.candidates[0].relevance, 0);
  assert.equal("content_hash" in min.candidates[0].provenance, false);
  // the canonical array feeds the existing pipeline directly
  const retrieval = runRetrieval(out.candidates, { projectId: PROJECT, classificationCeiling: "INTERNAL" });
  assert.deepEqual(retrieval.included, ["s1", "s2"]); // relevance reorder, both survive
  assert.equal(s2.ref, "s2");
});

test("PORT-02 malformed entries are excluded with typed reasons, never thrown, never silently dropped", () => {
  const bad = [
    "not-even-an-object",
    { ...typedSource({ id: "x_unknown" }), smuggled: true },
    typedSource({ id: "" }),
    typedSource({ id: "x|pipe" }),
    typedSource({ id: "x_kind", kind: "telepathy" }),
    typedSource({ id: "x_proj", project_id: "" }),
    typedSource({ id: "x_class", classification: "ULTRA" }),
    typedSource({ id: "x_flag", verified: "yes" }),
    typedSource({ id: "x_rel", relevance: Number.NaN }),
    typedSource({ id: "x_prov1", provenance: null }),
    typedSource({ id: "x_prov2", provenance: { origin: "o", retrieved_at: "2026-07-18T09:00:00Z", extra: 1 } }),
    typedSource({ id: "x_prov3", provenance: { origin: "", retrieved_at: "2026-07-18T09:00:00Z" } }),
    typedSource({ id: "x_prov4", provenance: { origin: "o", retrieved_at: "not-a-date" } }),
    typedSource({ id: "x_prov5", provenance: { origin: "o", retrieved_at: "2026-07-18T09:00:00Z", content_hash: "XYZ" } })
  ];
  const out = normalizeCandidateSources([...TYPED_OK, ...bad]);
  // full accounting: every input lands in exactly one bucket
  assert.equal(out.candidates.length + out.exclusions.length, TYPED_OK.length + bad.length);
  assert.equal(out.candidates.length, 2);
  const byRef = Object.fromEntries(out.exclusions.map((x) => [x.ref, x.reason]));
  assert.deepEqual(byRef, {
    "#2": "not-an-object",         // positional ref for an unidentifiable entry
    x_unknown: "unknown-field",
    "#4": "invalid-id",            // blank id -> positional
    "x|pipe": "invalid-id",
    x_kind: "invalid-kind",
    x_proj: "invalid-project",
    x_class: "invalid-classification",
    x_flag: "invalid-flag",
    x_rel: "invalid-relevance",
    x_prov1: "invalid-provenance",
    x_prov2: "invalid-provenance",
    x_prov3: "invalid-provenance",
    x_prov4: "invalid-provenance",
    x_prov5: "invalid-provenance"
  });
  for (const x of out.exclusions) {
    assert.equal(x.stage, PORT_STAGE); // pipeline-shaped exclusion entries
    assert.ok(PORT_EXCLUSION_REASONS.includes(x.reason), `typed reason: ${x.reason}`);
    assert.equal(typeof x.detail, "string");
  }
});

test("PORT-03 the port boundary itself is fail-closed: non-array input throws typed, well-typed FALSE flags pass through to the pipeline stages", () => {
  for (const notArray of [undefined, null, "s1", { id: "s1" }, 42]) {
    denies(() => normalizeCandidateSources(notArray), "DENY_MALFORMED_REQUEST", CandidateSourcePortError);
  }
  // type-valid but value-false entries are the PIPELINE's job, not the port's
  const out = normalizeCandidateSources([typedSource({ id: "s_unv", verified: false })]);
  assert.equal(out.exclusions.length, 0);
  const retrieval = runRetrieval(out.candidates, { projectId: PROJECT, classificationCeiling: "INTERNAL" });
  assert.deepEqual(retrieval.exclusions, [{ ref: "s_unv", stage: "verification", reason: "unverified" }]);
});

test("PORT-04 duplicate ids are excluded (first acceptance wins) and output is deep-frozen and deterministic", () => {
  const dup = normalizeCandidateSources([typedSource(), typedSource({ relevance: 99 })]);
  assert.equal(dup.candidates.length, 1);
  assert.equal(dup.candidates[0].relevance, 2); // the first accepted s1
  assert.deepEqual(dup.exclusions, [{ ref: "s1", stage: PORT_STAGE, reason: "duplicate-id", detail: "id already accepted from an earlier entry" }]);
  const a = normalizeCandidateSources(TYPED_OK);
  const b = normalizeCandidateSources(TYPED_OK);
  assert.deepEqual(a, b);
  assert.throws(() => { a.candidates.push({}); }, TypeError);
  assert.throws(() => { a.candidates[0].ref = "evil"; }, TypeError);
  assert.throws(() => { a.exclusions.push({}); }, TypeError);
});

// ——— round-trip: port -> mint -> issue -> consume ———

test("PORT-05 round-trip: normalized sources mint a receipt that issues and consumes; port exclusions never reach source_references", () => {
  const h = harness();
  const typed = [...TYPED_OK, typedSource({ id: "x_bad", kind: "telepathy" })];
  const port = normalizeCandidateSources(typed);
  assert.equal(port.exclusions.length, 1);
  const minted = mintReceiptDocument(mintInput({ candidateSources: port.candidates }));
  assert.deepEqual(minted.document.source_references, ["s1", "s2"]);
  assert.ok(!minted.document.source_references.includes("x_bad"));
  const issued = h.issue(minted.document, port.candidates, { idempotencyKey: "port_rt" });
  assert.equal(issued.state, "ISSUED");
  const consumed = h.svc.consumeReceipt(PROJECT, "rc_p1", { sessionId: "ses_1", actorId: REV, baseline: BASE });
  assert.equal(consumed.code, "ALLOW");
  // port exclusions concatenate naturally with pipeline exclusions ({ref, stage, reason} core)
  const full = [...port.exclusions, ...minted.exclusions];
  for (const x of full) for (const k of ["ref", "stage", "reason"]) assert.ok(k in x);
});

// ——— exclusions digest (sibling artifact) ———

test("DIGEST-01 opt-in digest is the canonical fingerprint of the returned exclusions list, verifiable by any holder", () => {
  const minted = mintReceiptDocument(mintInput({ candidateSources: normalizeCandidateSources(TYPED_OK).candidates, include_exclusions_digest: true, minimumSufficient: 1 }));
  assert.equal(typeof minted.exclusions_digest, "string");
  assert.match(minted.exclusions_digest, /^[a-f0-9]{64}$/);
  // verifiability: recompute from the sibling exclusions list
  assert.equal(canonicalFingerprint(minted.exclusions), minted.exclusions_digest);
  assert.deepEqual(minted.exclusions, [{ ref: "s2", stage: "minimum-sufficient", reason: "beyond minimum-sufficient cutoff" }]);
});

test("DIGEST-02 tamper detection: any change to the exclusions account breaks digest verification", () => {
  const minted = mintReceiptDocument(mintInput({ candidateSources: normalizeCandidateSources(TYPED_OK).candidates, include_exclusions_digest: true, minimumSufficient: 1 }));
  const tampered = [
    [],                                                            // dropped exclusion
    [{ ...minted.exclusions[0], ref: "s_other" }],                 // re-pointed exclusion
    [{ ...minted.exclusions[0], reason: "benign" }],               // rewritten reason
    [...minted.exclusions, { ref: "ghost", stage: "temporal", reason: "superseded or stale" }] // invented exclusion
  ];
  for (const t of tampered) assert.notEqual(canonicalFingerprint(t), minted.exclusions_digest);
  // determinism: same input -> same digest
  const again = mintReceiptDocument(mintInput({ candidateSources: normalizeCandidateSources(TYPED_OK).candidates, include_exclusions_digest: true, minimumSufficient: 1 }));
  assert.equal(again.exclusions_digest, minted.exclusions_digest);
});

test("DIGEST-03 the digest is a SIBLING artifact: the sealed document is byte-identical with and without the flag", () => {
  const cands = normalizeCandidateSources(TYPED_OK).candidates;
  const off = mintReceiptDocument(mintInput({ candidateSources: cands }));
  const on = mintReceiptDocument(mintInput({ candidateSources: cands, include_exclusions_digest: true }));
  assert.deepEqual({ ...on.document }, { ...off.document });
  assert.equal(on.document.content_hash, off.document.content_hash);
  // closed contextReceipt schema (additionalProperties: false) holds: no digest inside the document
  assert.equal("exclusions_digest" in on.document, false);
  // opt-out return shape is exactly the pre-S2 shape
  assert.deepEqual(Object.keys(off), ["document", "exclusions"]);
  assert.equal("exclusions_digest" in off, false);
  assert.deepEqual(Object.keys(on), ["document", "exclusions", "exclusions_digest"]);
});

test("DIGEST-04 flag is fail-closed and strictly opt-in: non-boolean denies, false behaves as absent", () => {
  const cands = normalizeCandidateSources(TYPED_OK).candidates;
  for (const badFlag of ["yes", 1, {}, []]) {
    denies(() => mintReceiptDocument(mintInput({ candidateSources: cands, include_exclusions_digest: badFlag })), "DENY_MALFORMED_REQUEST");
  }
  const explicitOff = mintReceiptDocument(mintInput({ candidateSources: cands, include_exclusions_digest: false }));
  assert.equal("exclusions_digest" in explicitOff, false);
  // unknown mint keys are still denied (the closed key set only grew by the one flag)
  denies(() => mintReceiptDocument(mintInput({ candidateSources: cands, exclusions_digest: "smuggled" })), "DENY_MALFORMED_REQUEST");
});

test("DIGEST-05 digest output is deep-frozen and issue path is untouched by the flag", () => {
  const h = harness();
  const cands = normalizeCandidateSources(TYPED_OK).candidates;
  const on = mintReceiptDocument(mintInput({ candidateSources: cands, include_exclusions_digest: true }));
  assert.throws(() => { on.exclusions_digest = "f".repeat(64); }, TypeError);
  assert.throws(() => { on.exclusions.push({ ref: "x", stage: "fake", reason: "fake" }); }, TypeError);
  // a digest-minted document round-trips through the UNCHANGED issue path
  const issued = h.issue(on.document, cands, { idempotencyKey: "digest_rt" });
  assert.equal(issued.state, "ISSUED");
  assert.deepEqual(issued.exclusions, on.exclusions);
  assert.equal(canonicalFingerprint(issued.exclusions), on.exclusions_digest);
});
