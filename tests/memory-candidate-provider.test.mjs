// MOD-MEM Slice S3 — Memory CandidateSource provider (pure mapper) + deterministic
// compaction floor tests.
//
// Scope: fail-closed construction; query validation and clock failure; honest
// field mapping (classification carried, verified-from-evidence, current computed
// from the validity window, relevance=confidence, provenance origin/content_hash);
// the four typed exclusion classes (MEMORY_MALFORMED with its DENY_* codes across
// every atomic-snapshot hostility — malformed/Proxy/custom-proto/accessor/symbol/
// non-finite/cyclic/traversal/unknown-field/charset; MEMORY_PROJECT_MISMATCH;
// DEDUP_DUPLICATE by content-hash; BUDGET_EXCEEDED tail truncation); the
// accounting invariant (included+excluded===records.length); determinism; frozen
// output; and a FEED-FORWARD proof over the REAL port + real mint: projected
// entries normalize with ZERO port-level exclusions and mint a Context Receipt
// whose source_references carry the memory ref.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMemoryCandidateProvider,
  MemoryCandidateProviderConfigurationError,
  MEMORY_PROVIDER_STAGE,
  MEMORY_PROVIDER_EXCLUSION_REASONS
} from "../src/services/memory-candidate-provider.mjs";
import { normalizeCandidateSources } from "../src/services/candidate-source-port.mjs";
import { mintReceiptDocument } from "../src/services/context-federation-service.mjs";

const FIXED = new Date("2026-07-20T10:00:00Z");
const FIXED_ISO = FIXED.toISOString();
const PROJECT = "proj-1";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function baseRecord(over = {}) {
  return {
    memory_record_id: "mr_a",
    version: 1,
    project_id: PROJECT,
    work_package_id: "wp-1",
    session_id: "sess-1",
    actor_id: "hippocampus-actor",
    layer: "project",
    source: "KnowledgeLedger",
    statement: "Composite-key delimiters must be denied at both service gates",
    classification: "INTERNAL",
    confidence: 1,
    provenance: { evidence_refs: ["ev_verified_001"], origin_record_id: "orig_a" },
    valid_from: "2026-07-01T00:00:00Z",
    valid_until: "2027-01-01T00:00:00Z",
    access_policy: "project-members",
    retention_policy: "retain-12-months",
    admitted_at: "2026-07-19T10:00:00Z",
    content_hash: HASH_A,
    ...over
  };
}

const provider = (over = {}) => createMemoryCandidateProvider({ now: () => FIXED, ...over });
const projectOne = (record, over = {}) => provider(over).toCandidateSources({ project_id: PROJECT, records: [record] });

// --- Construction -----------------------------------------------------------

test("S3 construction is fail-closed on a missing/malformed clock or estimator", () => {
  const has = (code) => (err) => err instanceof MemoryCandidateProviderConfigurationError && err.code === code;
  assert.throws(() => createMemoryCandidateProvider(), has("INVALID_CLOCK"));
  assert.throws(() => createMemoryCandidateProvider({ now: null }), has("INVALID_CLOCK"));
  assert.throws(() => createMemoryCandidateProvider({ now: () => FIXED, estimateTokens: 42 }), has("INVALID_ESTIMATOR"));
});

test("S3 surface is frozen and exposes only toCandidateSources", () => {
  const p = provider();
  assert.ok(Object.isFrozen(p));
  assert.deepEqual(Object.keys(p), ["toCandidateSources"]);
});

// --- Query validation + clock ----------------------------------------------

test("S3 query validation is fail-closed", () => {
  const p = provider();
  assert.equal(p.toCandidateSources(null).code, "DENY_MALFORMED_REQUEST");
  assert.equal(p.toCandidateSources([]).code, "DENY_MALFORMED_REQUEST");
  assert.equal(p.toCandidateSources({ project_id: PROJECT, records: [], rogue: 1 }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(p.toCandidateSources({ project_id: "  ", records: [] }).code, "DENY_MISSING_FIELDS");
  assert.equal(p.toCandidateSources({ project_id: PROJECT, records: "mr_a" }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(p.toCandidateSources({ project_id: PROJECT, records: [], token_budget: 0 }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(p.toCandidateSources({ project_id: PROJECT, records: [], token_budget: -5 }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(p.toCandidateSources({ project_id: PROJECT, records: [], token_budget: 1.5 }).code, "DENY_MALFORMED_REQUEST");
});

test("S3 empty records is a clean zero/zero result (invariant holds at 0)", () => {
  const result = provider().toCandidateSources({ project_id: PROJECT, records: [] });
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.exclusions, []);
  assert.deepEqual(result.accounting, { requested: 0, included: 0, excluded: 0 });
});

test("S3 denies when the clock is unusable", () => {
  const thrower = createMemoryCandidateProvider({ now: () => { throw new Error("no clock"); } });
  assert.equal(thrower.toCandidateSources({ project_id: PROJECT, records: [baseRecord()] }).code, "DENY_CLOCK_UNAVAILABLE");
  const nan = createMemoryCandidateProvider({ now: () => new Date(NaN) });
  assert.equal(nan.toCandidateSources({ project_id: PROJECT, records: [baseRecord()] }).code, "DENY_CLOCK_UNAVAILABLE");
});

// --- Honest field mapping ---------------------------------------------------

test("S3 maps a verified, in-window record to a shape-perfect entry", () => {
  const result = projectOne(baseRecord());
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.data_untrusted, true);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0], {
    id: "mr_a",
    kind: "memory",
    project_id: PROJECT,
    classification: "INTERNAL",
    verified: true,
    current: true,
    resolvable: true,
    relevance: 1,
    provenance: { origin: "KnowledgeLedger", retrieved_at: FIXED_ISO, content_hash: HASH_A }
  });
});

test("S3 classification is carried through verbatim (all four port levels)", () => {
  for (const cls of ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]) {
    const result = projectOne(baseRecord({ classification: cls }));
    assert.equal(result.sources[0].classification, cls);
  }
});

test("S3 relevance carries the record's own confidence", () => {
  assert.equal(projectOne(baseRecord({ confidence: 0.42 })).sources[0].relevance, 0.42);
  assert.equal(projectOne(baseRecord({ confidence: 0 })).sources[0].relevance, 0);
});

test("S3 verified is honest evidence-backed status; empty evidence rejects as malformed", () => {
  // evidence present -> verified true
  assert.equal(projectOne(baseRecord()).sources[0].verified, true);
  // empty evidence_refs is contract-invalid -> excluded, never an included verified:false
  const empty = projectOne(baseRecord({ provenance: { evidence_refs: [], origin_record_id: "o" } }));
  assert.equal(empty.sources.length, 0);
  assert.equal(empty.exclusions[0].reason, "MEMORY_MALFORMED");
});

test("S3 current is COMPUTED from the validity window at the server instant", () => {
  // in-window -> current true
  assert.equal(projectOne(baseRecord()).sources[0].current, true);
  // window already closed -> INCLUDED with current:false (mapper reports, port judges)
  const past = projectOne(baseRecord({ valid_from: "2026-01-01T00:00:00Z", valid_until: "2026-02-01T00:00:00Z" }));
  assert.equal(past.sources.length, 1);
  assert.equal(past.sources[0].current, false);
  // window not yet open -> current false, still included
  const future = projectOne(baseRecord({ valid_from: "2026-12-01T00:00:00Z", valid_until: "2027-12-01T00:00:00Z" }));
  assert.equal(future.sources[0].current, false);
});

test("S3 provenance origin is the record source ledger and content_hash is carried verbatim", () => {
  const result = projectOne(baseRecord({ source: "OutcomeLedger", content_hash: HASH_B }));
  assert.deepEqual(result.sources[0].provenance, { origin: "OutcomeLedger", retrieved_at: FIXED_ISO, content_hash: HASH_B });
});

// --- MEMORY_MALFORMED: atomic-snapshot + typed field rejections -------------

test("S3 MEMORY_MALFORMED covers every structural and field-type hostility", () => {
  const cases = [
    ["non-object record", 7, "DENY_SNAPSHOT_MALFORMED"],
    ["unknown field", baseRecord({ rogue_field: 1 }), "DENY_UNKNOWN_FIELD"],
    ["blank id", baseRecord({ memory_record_id: "  " }), "DENY_MISSING_FIELD"],
    ["reserved delimiter in id", baseRecord({ memory_record_id: "mr|a" }), "DENY_ID_CHARSET"],
    ["reserved @ in id", baseRecord({ memory_record_id: "mr@a" }), "DENY_ID_CHARSET"],
    ["bad source enum", baseRecord({ source: "RogueLedger" }), "DENY_FIELD_TYPE"],
    ["bad classification enum", baseRecord({ classification: "ULTRA" }), "DENY_FIELD_TYPE"],
    ["confidence out of range", baseRecord({ confidence: 1.5 }), "DENY_FIELD_TYPE"],
    ["non-finite confidence", baseRecord({ confidence: Number.POSITIVE_INFINITY }), "DENY_FIELD_TYPE"],
    ["blank statement", baseRecord({ statement: "" }), "DENY_MISSING_FIELD"],
    ["bad content_hash", baseRecord({ content_hash: "NOTHEX" }), "DENY_FIELD_TYPE"],
    ["unparseable window", baseRecord({ valid_from: "not-a-date" }), "DENY_FIELD_TYPE"],
    ["provenance not object", baseRecord({ provenance: "nope" }), "DENY_SNAPSHOT_MALFORMED"],
    ["evidence not array", baseRecord({ provenance: { evidence_refs: "e", origin_record_id: "o" } }), "DENY_FIELD_TYPE"]
  ];
  for (const [label, record, code] of cases) {
    const result = provider().toCandidateSources({ project_id: PROJECT, records: [record] });
    assert.equal(result.sources.length, 0, `${label}: not included`);
    assert.equal(result.exclusions.length, 1, `${label}: one exclusion`);
    assert.equal(result.exclusions[0].reason, "MEMORY_MALFORMED", `${label}: reason`);
    assert.equal(result.exclusions[0].code, code, `${label}: code`);
    assert.equal(result.exclusions[0].stage, MEMORY_PROVIDER_STAGE);
  }
});

test("S3 rejects a symbol own key structurally", () => {
  const record = baseRecord();
  record[Symbol("hidden")] = "smuggled";
  const result = provider().toCandidateSources({ project_id: PROJECT, records: [record] });
  assert.equal(result.exclusions[0].code, "DENY_SNAPSHOT_MALFORMED");
});

test("S3 rejects a custom prototype structurally (no prototype smuggling)", () => {
  class Hostile { get injected() { return "x"; } }
  const record = Object.assign(new Hostile(), baseRecord());
  const result = provider().toCandidateSources({ project_id: PROJECT, records: [record] });
  assert.equal(result.exclusions[0].reason, "MEMORY_MALFORMED");
  assert.equal(result.exclusions[0].code, "DENY_SNAPSHOT_MALFORMED");
});

test("S3 contains a hostile throwing accessor as MEMORY_MALFORMED, never a throw", () => {
  const record = baseRecord();
  Object.defineProperty(record, "statement", { enumerable: true, configurable: true, get() { throw new Error("boom"); } });
  const result = provider().toCandidateSources({ project_id: PROJECT, records: [record] });
  assert.equal(result.exclusions.length, 1);
  assert.equal(result.exclusions[0].reason, "MEMORY_MALFORMED");
  assert.equal(result.exclusions[0].code, "DENY_SNAPSHOT_MALFORMED");
});

test("S3 contains a hostile Proxy record (trap throws) as MEMORY_MALFORMED", () => {
  const target = baseRecord();
  const proxied = new Proxy(target, { get(t, prop) { if (prop === "content_hash") throw new Error("trap"); return t[prop]; } });
  const result = provider().toCandidateSources({ project_id: PROJECT, records: [proxied] });
  assert.equal(result.exclusions[0].reason, "MEMORY_MALFORMED");
  // a getter that returned different values on repeat reads cannot split the check:
  // each field is read exactly once.
});

test("S3 rejects a cyclic value placed where a scalar is expected", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const result = provider().toCandidateSources({ project_id: PROJECT, records: [baseRecord({ statement: cyclic })] });
  assert.equal(result.exclusions[0].reason, "MEMORY_MALFORMED");
  assert.equal(result.exclusions[0].code, "DENY_MISSING_FIELD"); // statement not a non-blank string
});

test("S3 rejects a tampered records array (poisoned iterator) at the query level", () => {
  const arr = [baseRecord()];
  arr[Symbol.iterator] = function* () { yield baseRecord({ memory_record_id: "mr_evil" }); };
  const result = provider().toCandidateSources({ project_id: PROJECT, records: arr });
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_MALFORMED_REQUEST");
});

// --- Project scope ----------------------------------------------------------

test("S3 excludes a cross-project record (deny-by-default scope)", () => {
  const result = provider().toCandidateSources({
    project_id: PROJECT,
    records: [baseRecord(), baseRecord({ memory_record_id: "mr_other", project_id: "proj-2", content_hash: HASH_B })]
  });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].id, "mr_a");
  assert.equal(result.exclusions[0].reason, "MEMORY_PROJECT_MISMATCH");
  assert.equal(result.exclusions[0].code, "DENY_PROJECT_SCOPE");
});

// --- Compaction floor: content-hash dedup -----------------------------------

test("S3 dedup by content-hash keeps the first occurrence and excludes later duplicates", () => {
  const result = provider().toCandidateSources({
    project_id: PROJECT,
    records: [
      baseRecord({ memory_record_id: "mr_1", content_hash: HASH_A }),
      baseRecord({ memory_record_id: "mr_2", content_hash: HASH_A }), // duplicate content
      baseRecord({ memory_record_id: "mr_3", content_hash: HASH_B })  // distinct
    ]
  });
  assert.deepEqual(result.sources.map((s) => s.id), ["mr_1", "mr_3"]);
  assert.equal(result.exclusions.length, 1);
  assert.equal(result.exclusions[0].reason, "DEDUP_DUPLICATE");
  assert.equal(result.exclusions[0].ref, "mr_2");
  assert.equal(result.exclusions[0].duplicate_of, "mr_1");
});

// --- Compaction floor: token-budget truncation ------------------------------

test("S3 token-budget truncation is a deterministic tail cut with typed accounting", () => {
  // fixed 10-token cost each; budget 25 admits two, truncates the tail.
  const result = createMemoryCandidateProvider({ now: () => FIXED, estimateTokens: () => 10 }).toCandidateSources({
    project_id: PROJECT,
    token_budget: 25,
    records: [
      baseRecord({ memory_record_id: "mr_1", content_hash: HASH_A }),
      baseRecord({ memory_record_id: "mr_2", content_hash: HASH_B }),
      baseRecord({ memory_record_id: "mr_3", content_hash: HASH_C })
    ]
  });
  assert.deepEqual(result.sources.map((s) => s.id), ["mr_1", "mr_2"]);
  assert.equal(result.exclusions.length, 1);
  assert.equal(result.exclusions[0].reason, "BUDGET_EXCEEDED");
  assert.equal(result.exclusions[0].ref, "mr_3");
  assert.deepEqual(
    { token_cost: result.exclusions[0].token_cost, budget_used: result.exclusions[0].budget_used, token_budget: result.exclusions[0].token_budget },
    { token_cost: 10, budget_used: 20, token_budget: 25 }
  );
  assert.equal(result.accounting.tokens_used, 20);
  assert.equal(result.accounting.token_budget, 25);
});

test("S3 truncation is a hard tail cut (no bin-packing of a later smaller record)", () => {
  let call = 0;
  const costs = [10, 100, 1]; // the small third record is NOT back-filled after the overflow
  const result = createMemoryCandidateProvider({ now: () => FIXED, estimateTokens: () => costs[call++] }).toCandidateSources({
    project_id: PROJECT,
    token_budget: 50,
    records: [
      baseRecord({ memory_record_id: "mr_1", content_hash: HASH_A }),
      baseRecord({ memory_record_id: "mr_2", content_hash: HASH_B }),
      baseRecord({ memory_record_id: "mr_3", content_hash: HASH_C })
    ]
  });
  assert.deepEqual(result.sources.map((s) => s.id), ["mr_1"]);
  assert.deepEqual(result.exclusions.map((e) => e.reason), ["BUDGET_EXCEEDED", "BUDGET_EXCEEDED"]);
});

test("S3 default estimator derives cost from the record statement length", () => {
  const short = baseRecord({ memory_record_id: "mr_s", statement: "abcd", content_hash: HASH_A }); // ceil(4/4)=1
  const long = baseRecord({ memory_record_id: "mr_l", statement: "x".repeat(80), content_hash: HASH_B }); // ceil(80/4)=20
  const result = provider().toCandidateSources({ project_id: PROJECT, token_budget: 5, records: [short, long] });
  assert.deepEqual(result.sources.map((s) => s.id), ["mr_s"]); // 1 fits, 20 overflows
  assert.equal(result.exclusions[0].reason, "BUDGET_EXCEEDED");
});

test("S3 denies the whole query when an injected estimator faults", () => {
  const result = createMemoryCandidateProvider({ now: () => FIXED, estimateTokens: () => { throw new Error("bad"); } }).toCandidateSources({
    project_id: PROJECT,
    token_budget: 10,
    records: [baseRecord()]
  });
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_ESTIMATOR_FAULT");
});

test("S3 dedup precedes budget: a duplicate is DEDUP_DUPLICATE even if the winner is later truncated", () => {
  const result = createMemoryCandidateProvider({ now: () => FIXED, estimateTokens: () => 100 }).toCandidateSources({
    project_id: PROJECT,
    token_budget: 1,
    records: [
      baseRecord({ memory_record_id: "mr_1", content_hash: HASH_A }),
      baseRecord({ memory_record_id: "mr_2", content_hash: HASH_A })
    ]
  });
  // mr_1 overflows the budget (BUDGET_EXCEEDED), mr_2 is still a content duplicate.
  const byRef = Object.fromEntries(result.exclusions.map((e) => [e.ref, e.reason]));
  assert.equal(byRef.mr_1, "BUDGET_EXCEEDED");
  assert.equal(byRef.mr_2, "DEDUP_DUPLICATE");
  assert.equal(result.sources.length, 0);
});

// --- Accounting, determinism, freeze ---------------------------------------

test("S3 accounting invariant holds across a mixed batch (included+excluded===records.length)", () => {
  const records = [
    baseRecord({ memory_record_id: "mr_ok", content_hash: HASH_A }),
    baseRecord({ memory_record_id: "mr_dup", content_hash: HASH_A }),      // dedup
    baseRecord({ memory_record_id: "mr_x", project_id: "proj-2", content_hash: HASH_B }), // scope
    baseRecord({ memory_record_id: "mr_bad", classification: "ULTRA", content_hash: HASH_C }), // malformed
    7                                                                      // malformed (non-object)
  ];
  const result = provider().toCandidateSources({ project_id: PROJECT, records });
  assert.equal(result.sources.length + result.exclusions.length, records.length);
  assert.deepEqual(result.accounting, { requested: 5, included: 1, excluded: 4 });
  for (const ex of result.exclusions) {
    assert.equal(ex.stage, MEMORY_PROVIDER_STAGE);
    assert.ok(MEMORY_PROVIDER_EXCLUSION_REASONS.includes(ex.reason));
  }
});

test("S3 projection is deterministic and stamps one uniform retrieved_at per call", () => {
  let ticks = 0;
  const advancing = () => new Date(FIXED.getTime() + ticks++ * 1000); // would drift if called per-record
  const build = () => createMemoryCandidateProvider({ now: advancing });
  const query = { project_id: PROJECT, records: [baseRecord({ memory_record_id: "mr_1", content_hash: HASH_A }), baseRecord({ memory_record_id: "mr_2", content_hash: HASH_B })] };
  const r1 = build().toCandidateSources(query);
  ticks = 0;
  const r2 = build().toCandidateSources(query);
  assert.deepEqual(r1.sources, r2.sources);
  assert.equal(r1.sources[0].provenance.retrieved_at, r1.sources[1].provenance.retrieved_at);
});

test("S3 output is deep-frozen", () => {
  const result = projectOne(baseRecord());
  assert.ok(Object.isFrozen(result));
  assert.throws(() => { result.sources.push({}); }, TypeError);
  assert.throws(() => { result.sources[0].verified = false; }, TypeError);
  assert.throws(() => { result.sources[0].provenance.origin = "x"; }, TypeError);
  assert.throws(() => { result.accounting.included = 99; }, TypeError);
});

// --- Feed-forward proof over the REAL port + real mint ----------------------

function mintIntent(over = {}) {
  return {
    receipt_id: "rc_mem", project_id: PROJECT, objective_id: "obj_mem", work_package_id: "wp-1",
    session_id: "sess-1", assigned_role: "REV", authority_scope: ["src/services"], baseline_version: "90c84a67e36a25941bc0983a0e687745919eca8c",
    acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [], evidence_obligations: ["review-report"],
    freshness_timestamp: "2026-07-20T09:00:00Z", ...over
  };
}

test("S3 FEED-FORWARD: projected memory entries normalize with ZERO port exclusions and mint a receipt", () => {
  const projected = provider().toCandidateSources({ project_id: PROJECT, records: [baseRecord({ memory_record_id: "mr_a", content_hash: HASH_A })] });
  assert.equal(projected.sources.length, 1);

  // shape-perfect: the port accepts every entry with NO stage-0 exclusion
  const normalized = normalizeCandidateSources(projected.sources);
  assert.deepEqual(normalized.exclusions, []);
  assert.equal(normalized.candidates.length, 1);
  assert.equal(normalized.candidates[0].kind, "memory");

  // mint round-trip: the normalized memory candidate survives retrieval and lands
  // in the sealed receipt's source_references
  const minted = mintReceiptDocument(mintIntent({ candidateSources: normalized.candidates, classificationCeiling: "INTERNAL" }));
  assert.deepEqual(minted.document.source_references, ["mr_a"]);
  assert.equal(minted.exclusions.length, 0);
  assert.equal(minted.document.version, 1);
  assert.equal(minted.document.content_hash.length, 64);
});

test("S3 FEED-FORWARD: a deduped/truncated batch still normalizes with zero port exclusions", () => {
  const projected = createMemoryCandidateProvider({ now: () => FIXED, estimateTokens: () => 10 }).toCandidateSources({
    project_id: PROJECT,
    token_budget: 15,
    records: [
      baseRecord({ memory_record_id: "mr_1", content_hash: HASH_A }),
      baseRecord({ memory_record_id: "mr_2", content_hash: HASH_A }), // dedup
      baseRecord({ memory_record_id: "mr_3", content_hash: HASH_B })  // budget-truncated
    ]
  });
  assert.deepEqual(projected.sources.map((s) => s.id), ["mr_1"]);
  const normalized = normalizeCandidateSources(projected.sources);
  assert.deepEqual(normalized.exclusions, []);
  assert.equal(normalized.candidates.length, 1);
});
