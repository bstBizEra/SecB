// MOD-KNOW Slice S3 — Knowledge CandidateSource provider (pure mapper) tests.
//
// Scope: fail-closed construction; query validation and clock failure; honest
// field mapping (classification default + override, verified-only-on-
// verified_true, provenance, content_hash presence); the three typed exclusion
// classes (KNOWLEDGE_UNRESOLVED with verbatim passthrough code, CURRENT_
// SUPERSEDED, LINEAGE_BROKEN); the contested-but-included annotation
// (verified:false + lowered relevance); the accounting invariant
// (included+excluded===refs.length); determinism; frozen output; and a
// FEED-FORWARD proof over the REAL stack (real S1 + real S2 + real port +
// real mint): projected entries normalize with ZERO port-level exclusions and
// mint a Context Receipt whose source_references carry the knowledge ref.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createKnowledgeCandidateProvider,
  KnowledgeCandidateProviderConfigurationError,
  KNOWLEDGE_PROVIDER_STAGE,
  KNOWLEDGE_PROVIDER_EXCLUSION_REASONS
} from "../src/services/knowledge-candidate-provider.mjs";
import { normalizeCandidateSources } from "../src/services/candidate-source-port.mjs";
import { mintReceiptDocument } from "../src/services/context-federation-service.mjs";
import { createKnowledgeClaimService } from "../src/services/knowledge-claim-service.mjs";
import { createKnowledgeLinkageService } from "../src/services/knowledge-linkage-service.mjs";
import { KnowledgeLedger } from "../src/ledger/temporal-ledgers.mjs";
import { DurableLedger } from "../src/ledger/durable-ledger.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const FIXED = new Date("2026-07-20T10:00:00Z");
const FIXED_ISO = FIXED.toISOString();
const PROJECT = "proj-1";

function baseClaim(over = {}) {
  return {
    claim_id: "kc_a",
    version: 1,
    project_id: PROJECT,
    work_package_id: "wp-1",
    session_id: "sess-1",
    actor_id: "hippocampus-actor",
    statement: "Composite-key delimiters must be denied at both service gates",
    derivation: "Derived from mod-know-gap-assessment-001 G6",
    truth_status: "verified_true",
    evidence_refs: ["ev_verified_001"],
    claimed_at: "2026-07-19T10:00:00Z",
    valid_from: "2026-07-01T00:00:00Z",
    valid_until: "2027-01-01T00:00:00Z",
    retention_policy: "retain-12-months",
    ...over
  };
}

// --- lightweight port doubles (unit tests own the S1/S2 return values) ------

function fakeClaimService(spec) {
  // spec: { [claim_id]: { claim } | { deny: {code, reason} } | { throw: true } }
  return {
    getClaim({ claim_id }) {
      const e = spec[claim_id];
      if (!e) return { decision: "DENY", code: "DENY_UNKNOWN_CLAIM", reason: `unknown: ${claim_id}` };
      if (e.throw) throw new Error("claim service boom");
      if (e.deny) return { decision: "DENY", data_untrusted: true, ...e.deny };
      return { decision: "ALLOW", code: "RESOLVED", data_untrusted: true, resolved_at: FIXED_ISO, claim: e.claim };
    }
  };
}

function fakeLinkageService(spec) {
  // spec: { [ref]: { current_claim_id?, contradictions?, claim } | { deny: {...} } | { throw: true } }
  return {
    resolveCurrent(ref) {
      const e = spec[ref];
      if (!e) return { decision: "DENY", code: "DENY_UNKNOWN_CLAIM", reason: `unknown current: ${ref}` };
      if (e.throw) throw new Error("linkage service boom");
      if (e.deny) return { decision: "DENY", ...e.deny };
      return {
        decision: "ALLOW",
        code: "CURRENT_RESOLVED",
        current_claim_id: e.current_claim_id ?? ref,
        contradictions: e.contradictions ?? [],
        claim: e.claim
      };
    }
  };
}

// A provider over a single, current, resolvable claim.
function singleProvider(claim, { contradictions = [], now } = {}) {
  return createKnowledgeCandidateProvider({
    claimService: fakeClaimService({ [claim.claim_id]: { claim } }),
    linkageService: fakeLinkageService({ [claim.claim_id]: { claim, contradictions } }),
    now: now ?? (() => FIXED)
  });
}

// --- Construction -----------------------------------------------------------

test("S3 construction is fail-closed on every missing or malformed collaborator", () => {
  const has = (code) => (err) => err instanceof KnowledgeCandidateProviderConfigurationError && err.code === code;
  const cs = { getClaim() {} };
  const ls = { resolveCurrent() {} };
  assert.throws(() => createKnowledgeCandidateProvider(), has("INVALID_CLAIM_SERVICE"));
  assert.throws(() => createKnowledgeCandidateProvider({ claimService: {}, linkageService: ls, now: () => FIXED }), has("INVALID_CLAIM_SERVICE"));
  assert.throws(() => createKnowledgeCandidateProvider({ claimService: cs, linkageService: {}, now: () => FIXED }), has("INVALID_LINKAGE_SERVICE"));
  assert.throws(() => createKnowledgeCandidateProvider({ claimService: cs, linkageService: ls, now: null }), has("INVALID_CLOCK"));
});

test("S3 surface is frozen and exposes only toCandidateSources", () => {
  const provider = singleProvider(baseClaim());
  assert.ok(Object.isFrozen(provider));
  assert.deepEqual(Object.keys(provider), ["toCandidateSources"]);
});

// --- Query validation + clock ----------------------------------------------

test("S3 query validation is fail-closed", () => {
  const provider = singleProvider(baseClaim());
  assert.equal(provider.toCandidateSources(null).code, "DENY_MALFORMED_REQUEST");
  assert.equal(provider.toCandidateSources([]).code, "DENY_MALFORMED_REQUEST");
  assert.equal(provider.toCandidateSources({ project_id: PROJECT, refs: [], rogue: 1 }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(provider.toCandidateSources({ project_id: "  ", refs: [] }).code, "DENY_MISSING_FIELDS");
  assert.equal(provider.toCandidateSources({ project_id: PROJECT, refs: "kc_a" }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(provider.toCandidateSources({ project_id: PROJECT, refs: ["  "] }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(provider.toCandidateSources({ project_id: PROJECT, refs: ["kc|a"] }).code, "DENY_ID_CHARSET");
  assert.equal(provider.toCandidateSources({ project_id: PROJECT, refs: ["kc@a"] }).code, "DENY_ID_CHARSET");
});

test("S3 empty refs is a clean zero/zero result (invariant holds at 0)", () => {
  const result = singleProvider(baseClaim()).toCandidateSources({ project_id: PROJECT, refs: [] });
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.exclusions, []);
  assert.deepEqual(result.accounting, { requested: 0, included: 0, excluded: 0 });
});

test("S3 denies when the clock is unusable", () => {
  const provider = singleProvider(baseClaim(), { now: () => { throw new Error("no clock"); } });
  assert.equal(provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] }).code, "DENY_CLOCK_UNAVAILABLE");
  const nanClock = createKnowledgeCandidateProvider({
    claimService: fakeClaimService({}), linkageService: fakeLinkageService({}), now: () => new Date(NaN)
  });
  assert.equal(nanClock.toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] }).code, "DENY_CLOCK_UNAVAILABLE");
});

// --- Honest field mapping ---------------------------------------------------

test("S3 maps a verified_true, uncontested, current claim to a shape-perfect entry", () => {
  const result = singleProvider(baseClaim()).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.data_untrusted, true);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0], {
    id: "kc_a",
    kind: "knowledge",
    project_id: PROJECT,
    classification: "INTERNAL",
    verified: true,
    current: true,
    resolvable: true,
    relevance: 1,
    provenance: { origin: "knowledge-ledger", retrieved_at: FIXED_ISO }
  });
});

test("S3 verified is true ONLY for truth_status verified_true", () => {
  for (const status of ["verified_false", "partially_supported", "conflicted", "unverified", "outdated"]) {
    const result = singleProvider(baseClaim({ truth_status: status })).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
    assert.equal(result.sources[0].verified, false, `${status} must not be verified`);
    // still INCLUDED — the port/pipeline judges the value, the mapper only reports it honestly
    assert.equal(result.sources.length, 1);
  }
  const ok = singleProvider(baseClaim({ truth_status: "verified_true" })).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(ok.sources[0].verified, true);
});

test("S3 classification defaults to INTERNAL but honors an explicit valid claim classification", () => {
  const def = singleProvider(baseClaim()).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(def.sources[0].classification, "INTERNAL");
  const explicit = singleProvider(baseClaim({ classification: "CONFIDENTIAL" })).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(explicit.sources[0].classification, "CONFIDENTIAL");
  // an invalid classification value falls back to the honest default, never widens
  const bad = singleProvider(baseClaim({ classification: "ULTRA" })).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(bad.sources[0].classification, "INTERNAL");
});

test("S3 carries a valid content_hash only when the claim exposes one", () => {
  const withHash = singleProvider(baseClaim({ content_hash: "a".repeat(64) })).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(withHash.sources[0].provenance.content_hash, "a".repeat(64));
  const badHash = singleProvider(baseClaim({ content_hash: "NOTHEX" })).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal("content_hash" in badHash.sources[0].provenance, false);
});

// --- Exclusion classes ------------------------------------------------------

test("S3 KNOWLEDGE_UNRESOLVED carries the verbatim S1 passthrough code", () => {
  const provider = createKnowledgeCandidateProvider({
    claimService: fakeClaimService({ kc_gone: { deny: { code: "DENY_TEMPORAL_BOUNDARY", reason: "outside window" } } }),
    linkageService: fakeLinkageService({}),
    now: () => FIXED
  });
  const result = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_gone"] });
  assert.equal(result.sources.length, 0);
  assert.equal(result.exclusions.length, 1);
  assert.deepEqual(
    { ref: result.exclusions[0].ref, stage: result.exclusions[0].stage, reason: result.exclusions[0].reason, code: result.exclusions[0].code },
    { ref: "kc_gone", stage: "knowledge-provider", reason: "KNOWLEDGE_UNRESOLVED", code: "DENY_TEMPORAL_BOUNDARY" }
  );
});

test("S3 a throwing claim service excludes (never throws) as KNOWLEDGE_UNRESOLVED", () => {
  const provider = createKnowledgeCandidateProvider({
    claimService: fakeClaimService({ kc_a: { throw: true } }),
    linkageService: fakeLinkageService({}),
    now: () => FIXED
  });
  const result = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(result.exclusions[0].reason, "KNOWLEDGE_UNRESOLVED");
  assert.equal(result.exclusions[0].code, "DENY_CLAIM_SERVICE_ERROR");
});

test("S3 CURRENT_SUPERSEDED when a newer version wins the currency walk", () => {
  const claim = baseClaim();
  const provider = createKnowledgeCandidateProvider({
    claimService: fakeClaimService({ kc_a: { claim } }),
    linkageService: fakeLinkageService({ kc_a: { current_claim_id: "kc_b", claim } }),
    now: () => FIXED
  });
  const result = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(result.sources.length, 0);
  assert.equal(result.exclusions[0].reason, "CURRENT_SUPERSEDED");
  assert.equal(result.exclusions[0].current_claim_id, "kc_b");
});

test("S3 LINEAGE_BROKEN carries the lineage_issue and the passthrough code", () => {
  const claim = baseClaim();
  const provider = createKnowledgeCandidateProvider({
    claimService: fakeClaimService({ kc_a: { claim } }),
    linkageService: fakeLinkageService({ kc_a: { deny: { code: "DENY_BROKEN_LINEAGE", reason: "branched", lineage_issue: "branched" } } }),
    now: () => FIXED
  });
  const result = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(result.exclusions[0].reason, "LINEAGE_BROKEN");
  assert.equal(result.exclusions[0].code, "DENY_BROKEN_LINEAGE");
  assert.equal(result.exclusions[0].lineage_issue, "branched");
});

test("S3 a non-broken currency denial folds to KNOWLEDGE_UNRESOLVED with its code", () => {
  const claim = baseClaim();
  const provider = createKnowledgeCandidateProvider({
    claimService: fakeClaimService({ kc_a: { claim } }),
    linkageService: fakeLinkageService({ kc_a: { deny: { code: "DENY_TEMPORAL_BOUNDARY", reason: "winner expired" } } }),
    now: () => FIXED
  });
  const result = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(result.exclusions[0].reason, "KNOWLEDGE_UNRESOLVED");
  assert.equal(result.exclusions[0].code, "DENY_TEMPORAL_BOUNDARY");
});

// Regression: mod-know-s3-second-independent-review-001 finding 3 (LOW). A
// linkage service that returns ALLOW with current_claim_id === ref but a
// malformed (undefined) claim must be denied per-ref, never thrown, and must
// NOT crash the batch for other, well-formed refs alongside it — mirroring
// resolveClaim's isPlainObject(resolution.claim) guard exactly.
test("S3 resolveCurrency denies a malformed ALLOW claim per-ref instead of crashing the batch", () => {
  const kc_ok = baseClaim({ claim_id: "kc_ok" });
  const claimService = fakeClaimService({
    kc_bad: { claim: baseClaim({ claim_id: "kc_bad" }) },
    kc_ok: { claim: kc_ok }
  });
  // Hand-built fake linkageService reproducing the reviewer's exact probe:
  // {decision: "ALLOW", current_claim_id: ref, claim: undefined}.
  const linkageService = {
    resolveCurrent(ref) {
      if (ref === "kc_bad") {
        return { decision: "ALLOW", code: "CURRENT_RESOLVED", current_claim_id: ref, contradictions: [], claim: undefined };
      }
      return { decision: "ALLOW", code: "CURRENT_RESOLVED", current_claim_id: ref, contradictions: [], claim: kc_ok };
    }
  };
  const provider = createKnowledgeCandidateProvider({ claimService, linkageService, now: () => FIXED });

  let result;
  assert.doesNotThrow(() => {
    result = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_bad", "kc_ok"] });
  }, "malformed claim on ALLOW must never crash toCandidateSources");

  // The whole batch survives: accounting invariant holds, 1 excluded + 1 included.
  assert.deepEqual(result.accounting, { requested: 2, included: 1, excluded: 1 });

  // kc_bad is cleanly denied per-ref with a typed KNOWLEDGE_UNRESOLVED code.
  const excluded = result.exclusions.find((e) => e.ref === "kc_bad");
  assert.ok(excluded, "kc_bad must be excluded, not silently dropped");
  assert.equal(excluded.reason, "KNOWLEDGE_UNRESOLVED");
  assert.equal(excluded.code, "DENY_LINKAGE_MALFORMED_CLAIM");

  // The OTHER well-formed ref in the same batch still resolves correctly —
  // this is the whole point of the fix: isolate the failure per-ref.
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].id, "kc_ok");
  assert.equal(result.sources[0].project_id, PROJECT);
});

// --- Contested annotation ---------------------------------------------------

test("S3 a contested current claim is INCLUDED but honestly marked verified:false with lowered relevance", () => {
  const claim = baseClaim({ truth_status: "verified_true" });
  const contradictions = [{ with_claim_ref: "kc_x", basis_note: "conflicts on gate G7", asserted_at: "2026-07-19T12:00:00Z" }];
  const result = singleProvider(claim, { contradictions }).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.equal(result.sources.length, 1, "contested claims are not excluded — contradiction is linkage, not verdict");
  assert.equal(result.sources[0].verified, false, "contested forces verified:false even over verified_true");
  assert.equal(result.sources[0].relevance, 0, "contested lowers the relevance annotation");
  assert.equal(result.exclusions.length, 0);
});

// --- Accounting, determinism, freeze ---------------------------------------

test("S3 accounting invariant holds across a mixed batch (included+excluded===refs.length)", () => {
  const kc_ok = baseClaim({ claim_id: "kc_ok" });
  const kc_contested = baseClaim({ claim_id: "kc_contested" });
  const provider = createKnowledgeCandidateProvider({
    claimService: fakeClaimService({
      kc_ok: { claim: kc_ok },
      kc_contested: { claim: kc_contested },
      kc_superseded: { claim: baseClaim({ claim_id: "kc_superseded" }) }
      // kc_missing absent -> DENY_UNKNOWN_CLAIM
    }),
    linkageService: fakeLinkageService({
      kc_ok: { claim: kc_ok },
      kc_contested: { claim: kc_contested, contradictions: [{ with_claim_ref: "z" }] },
      kc_superseded: { current_claim_id: "kc_new", claim: baseClaim({ claim_id: "kc_superseded" }) }
    }),
    now: () => FIXED
  });
  const refs = ["kc_ok", "kc_contested", "kc_superseded", "kc_missing"];
  const result = provider.toCandidateSources({ project_id: PROJECT, refs });
  assert.equal(result.sources.length + result.exclusions.length, refs.length);
  assert.deepEqual(result.accounting, { requested: 4, included: 2, excluded: 2 });
  // every exclusion reason is in the closed vocabulary and stamped with the provider stage
  for (const ex of result.exclusions) {
    assert.equal(ex.stage, KNOWLEDGE_PROVIDER_STAGE);
    assert.ok(KNOWLEDGE_PROVIDER_EXCLUSION_REASONS.includes(ex.reason));
  }
});

test("S3 projection is deterministic and stamps one uniform retrieved_at per call", () => {
  const kc_a = baseClaim({ claim_id: "kc_a" });
  const kc_b = baseClaim({ claim_id: "kc_b" });
  let ticks = 0;
  const advancing = () => new Date(FIXED.getTime() + ticks++ * 1000); // would drift if called per-ref
  const build = () => createKnowledgeCandidateProvider({
    claimService: fakeClaimService({ kc_a: { claim: kc_a }, kc_b: { claim: kc_b } }),
    linkageService: fakeLinkageService({ kc_a: { claim: kc_a }, kc_b: { claim: kc_b } }),
    now: advancing
  });
  const r1 = build().toCandidateSources({ project_id: PROJECT, refs: ["kc_a", "kc_b"] });
  ticks = 0;
  const r2 = build().toCandidateSources({ project_id: PROJECT, refs: ["kc_a", "kc_b"] });
  assert.deepEqual(r1.sources, r2.sources);
  // single clock read per projection -> both entries share retrieved_at
  assert.equal(r1.sources[0].provenance.retrieved_at, r1.sources[1].provenance.retrieved_at);
});

test("S3 output is deep-frozen", () => {
  const result = singleProvider(baseClaim()).toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
  assert.ok(Object.isFrozen(result));
  assert.throws(() => { result.sources.push({}); }, TypeError);
  assert.throws(() => { result.sources[0].verified = true; }, TypeError);
  assert.throws(() => { result.accounting.included = 99; }, TypeError);
});

// --- Feed-forward proof over the REAL stack ---------------------------------

const kernelSodRules = { checkPairwiseDistinct };
const LEDGER_EVIDENCE = { ev_verified_001: { evidence_id: "ev_verified_001", verification_status: "VERIFIED" } };

function realStack(claims) {
  const dir = mkdtempSync(join(tmpdir(), "secb-know-s3-"));
  const clock = () => FIXED;
  const knowledgeLedger = new KnowledgeLedger({
    filePath: join(dir, "knowledge.ndjson"),
    evidenceLookup: (ref) => LEDGER_EVIDENCE[ref] ?? null
  });
  const claimService = createKnowledgeClaimService({
    knowledgeLedger,
    sodRules: kernelSodRules,
    evidenceResolver: { resolveAccepted: (ref) => (LEDGER_EVIDENCE[ref] ? { ok: true, envelope: { evidence_id: ref } } : { ok: false, code: "DENY_EVIDENCE_NOT_ACCEPTED", reason: ref }) },
    now: clock,
    auditWriter: () => {}
  });
  const sidecarLedger = new DurableLedger({ filePath: join(dir, "knowledge-linkage.ndjson"), ledgerId: "secb-knowledge-linkage-sidecar" });
  const linkageService = createKnowledgeLinkageService({ claimService, sidecarLedger, sodRules: kernelSodRules, now: clock, auditWriter: () => {} });
  claims.forEach((payload, index) => {
    const admitted = claimService.proposeClaim({
      claim: payload,
      admission: { proposer: "agent-p", approver: "agent-q" },
      idempotencyKey: `idem_${payload.claim_id}`,
      expectedSequence: index
    });
    assert.equal(admitted.decision, "ALLOW", `admit ${payload.claim_id}: ${admitted.code}`);
  });
  const provider = createKnowledgeCandidateProvider({ claimService, linkageService, now: clock });
  return { provider, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function mintIntent(over = {}) {
  return {
    receipt_id: "rc_know", project_id: PROJECT, objective_id: "obj_know", work_package_id: "wp-1",
    session_id: "sess-1", assigned_role: "REV", authority_scope: ["src/services"], baseline_version: "90c84a67e36a25941bc0983a0e687745919eca8c",
    acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [], evidence_obligations: ["review-report"],
    freshness_timestamp: "2026-07-20T09:00:00Z", ...over
  };
}

test("S3 FEED-FORWARD: projected knowledge entries normalize with ZERO port exclusions and mint a receipt", () => {
  const { provider, cleanup } = realStack([baseClaim({ claim_id: "kc_a" })]);
  try {
    const projected = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_a"] });
    assert.equal(projected.sources.length, 1);

    // shape-perfect: the port accepts every entry with NO stage-0 exclusion
    const normalized = normalizeCandidateSources(projected.sources);
    assert.deepEqual(normalized.exclusions, []);
    assert.equal(normalized.candidates.length, 1);
    assert.equal(normalized.candidates[0].kind, "knowledge");

    // mint round-trip: the normalized knowledge candidate survives retrieval
    // and lands in the sealed receipt's source_references
    const minted = mintReceiptDocument(mintIntent({ candidateSources: normalized.candidates, classificationCeiling: "INTERNAL" }));
    assert.deepEqual(minted.document.source_references, ["kc_a"]);
    assert.equal(minted.exclusions.length, 0);
    // the minted document is a valid, sealed contextReceipt (validateContract ran inside mint)
    assert.equal(minted.document.version, 1);
    assert.equal(minted.document.content_hash.length, 64);
  } finally {
    cleanup();
  }
});

test("S3 FEED-FORWARD: a superseded ref is excluded upstream and never reaches the port", () => {
  // kc_a superseded by kc_b via the real S2 sidecar -> provider excludes kc_a,
  // includes kc_b; the port sees only the current head, still zero exclusions.
  const { provider, cleanup } = realStackWithSupersession();
  try {
    const projected = provider.toCandidateSources({ project_id: PROJECT, refs: ["kc_a", "kc_b"] });
    const included = projected.sources.map((s) => s.id);
    assert.deepEqual(included, ["kc_b"]);
    assert.equal(projected.exclusions.length, 1);
    assert.equal(projected.exclusions[0].reason, "CURRENT_SUPERSEDED");
    assert.equal(projected.exclusions[0].current_claim_id, "kc_b");
    const normalized = normalizeCandidateSources(projected.sources);
    assert.deepEqual(normalized.exclusions, []);
  } finally {
    cleanup();
  }
});

function realStackWithSupersession() {
  const dir = mkdtempSync(join(tmpdir(), "secb-know-s3-sup-"));
  const clock = () => FIXED;
  const knowledgeLedger = new KnowledgeLedger({
    filePath: join(dir, "knowledge.ndjson"),
    evidenceLookup: (ref) => LEDGER_EVIDENCE[ref] ?? null
  });
  const claimService = createKnowledgeClaimService({
    knowledgeLedger,
    sodRules: kernelSodRules,
    evidenceResolver: { resolveAccepted: (ref) => (LEDGER_EVIDENCE[ref] ? { ok: true, envelope: { evidence_id: ref } } : { ok: false, code: "DENY", reason: ref }) },
    now: clock,
    auditWriter: () => {}
  });
  const sidecarLedger = new DurableLedger({ filePath: join(dir, "knowledge-linkage.ndjson"), ledgerId: "secb-knowledge-linkage-sidecar" });
  const linkageService = createKnowledgeLinkageService({ claimService, sidecarLedger, sodRules: kernelSodRules, now: clock, auditWriter: () => {} });
  [baseClaim({ claim_id: "kc_a" }), baseClaim({ claim_id: "kc_b", version: 2 })].forEach((payload, index) => {
    assert.equal(claimService.proposeClaim({ claim: payload, admission: { proposer: "agent-p", approver: "agent-q" }, idempotencyKey: `idem_${payload.claim_id}`, expectedSequence: index }).decision, "ALLOW");
  });
  const sup = linkageService.recordSupersession({
    newClaimRef: "kc_b", supersededClaimRef: "kc_a",
    authorization: { asserter: "agent-x", approver: "agent-y" }, idempotencyKey: "idem_sup", expectedSequence: 0
  });
  assert.equal(sup.decision, "ALLOW", `supersession: ${sup.code}`);
  const provider = createKnowledgeCandidateProvider({ claimService, linkageService, now: clock });
  return { provider, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
