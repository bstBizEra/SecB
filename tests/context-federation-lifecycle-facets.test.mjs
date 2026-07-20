import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { ContextFederationService, ContextFederationError } from "../src/services/context-federation-service.mjs";

// MOD-CONTEXT S3 — convergence record + lifecycle read-model facets.
// Covers: crosswalk decision doc exists + is manifest-linked (validator link
// check covers it); getReceipt lifecycle facets (EXPIRED computed at boundary
// times, ISSUED/SUPERSEDED/REVOKED passthrough, CONSUMED from the ledger);
// projection additivity (every pre-existing field byte-identical); frozen.

const root = resolve(import.meta.dirname, "..");
const PROJECT = "prj_ctx";
const WP = "wp_ctx";
const BASE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const START = "2026-07-18T10:00:00Z";
const VALID_UNTIL = "2026-08-01T00:00:00Z";
// issuedAt(START) + DEFAULT_TTL(24h) < VALID_UNTIL, so expiresAt = START + 24h.
const EXPIRY = "2026-07-19T10:00:00Z";

const SOURCES = [
  { ref: "s1", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 2 },
  { ref: "s2", projectId: PROJECT, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 1 }
];

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

// Minimal effective-contract stub: the service only calls resolveEffective.
function wpStub() {
  return {
    resolveEffective: (_p, _w, { baseline }) => ({
      code: "ALLOW", version: 1,
      effective: { baseline, valid_until: VALID_UNTIL, allowed_paths: ["src/services", "tests"] }
    })
  };
}

function harness({ start = START } = {}) {
  let nowMs = Date.parse(start);
  const svc = new ContextFederationService({ workPackageService: wpStub(), now: () => new Date(nowMs) });
  const ctx = { sessionId: "ses_1", actorId: "eng", baseline: BASE };
  const issue = (over = {}) => svc.issueReceipt({
    document: receiptDoc(over.document), candidateSources: SOURCES,
    actorId: "eng", authorityRef: "auth", baseline: BASE, idempotencyKey: over.idempotencyKey ?? "idem_issue"
  });
  return { svc, ctx, issue, setNow: (iso) => { nowMs = Date.parse(iso); } };
}

const PRE_EXISTING_KEYS = ["receiptId", "projectId", "version", "state", "document", "exclusions"];

test("S3 crosswalk decision doc exists and is manifest-linked", () => {
  const docPath = "docs/03-project-control/candidates/context-receipt-shape-convergence-001.md";
  assert.ok(existsSync(resolve(root, docPath)), "crosswalk doc exists");

  const body = readFileSync(resolve(root, docPath), "utf8");
  assert.ok(/DRAFT, NOT EFFECTIVE/.test(body), "doc carries the DRAFT/NOT EFFECTIVE marker");
  assert.ok(/operator decision section/i.test(body), "doc carries the operator-decision section");

  // Manifest membership — the root MANIFEST drives the validator link check
  // (validate-foundation.mjs iterates root-manifest .md links); the docs
  // MANIFEST catalogues it as a candidate doc.
  const rootManifest = JSON.parse(readFileSync(resolve(root, "MANIFEST.json"), "utf8"));
  const docsManifest = JSON.parse(readFileSync(resolve(root, "docs/MANIFEST.json"), "utf8"));
  assert.ok(rootManifest.files.includes(docPath), "crosswalk doc is in root MANIFEST (link-checked)");
  assert.ok(docsManifest.files.includes(docPath), "crosswalk doc is in docs MANIFEST");

  // Every relative markdown link in the crosswalk doc must resolve (mirrors
  // the foundation validator's link check, so its coverage is proven here).
  const dir = resolve(root, "docs/03-project-control/candidates");
  const links = [...body.matchAll(/\]\((?!https?:|#)([^)#]+)(?:#[^)]+)?\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 3, "doc links the three shape files");
  for (const link of links) {
    assert.ok(existsSync(resolve(dir, link)), `crosswalk link resolves: ${link}`);
  }
});

test("getReceipt exposes ISSUED lifecycle facets and preserves pre-existing fields", () => {
  const { svc, issue } = harness();
  issue();
  const got = svc.getReceipt(PROJECT, "rc_1");

  // Facets (new, additive).
  assert.equal(got.effective_status, "ISSUED");
  assert.equal(got.expired, false);
  assert.equal(got.consumed, false);

  // Pre-existing fields present and correct.
  assert.equal(got.receiptId, "rc_1");
  assert.equal(got.projectId, PROJECT);
  assert.equal(got.version, 1);
  assert.equal(got.state, "ISSUED");
  assert.deepEqual(got.document.source_references, ["s1", "s2"]);
  assert.ok(Array.isArray(got.exclusions));

  // Additivity: the pre-existing keys are a subset, and the ONLY additions are
  // the three named facets.
  const added = Object.keys(got).filter((k) => !PRE_EXISTING_KEYS.includes(k));
  assert.deepEqual(added.sort(), ["consumed", "effective_status", "expired"]);
});

test("pre-existing projection fields are byte-identical to the un-faceted shape", () => {
  const { svc, issue } = harness();
  const issued = issue();
  const got = svc.getReceipt(PROJECT, "rc_1");

  // Reconstruct exactly the pre-S3 return object and compare byte-for-byte
  // (canonical fingerprint) against the pre-existing slice of the new return.
  const preExistingSlice = Object.fromEntries(PRE_EXISTING_KEYS.map((k) => [k, got[k]]));
  const expected = {
    receiptId: "rc_1", projectId: PROJECT, version: 1, state: "ISSUED",
    document: got.document, exclusions: got.exclusions
  };
  assert.equal(canonicalFingerprint(preExistingSlice), canonicalFingerprint(expected));

  // The sealed document is untouched: its content_hash still verifies and
  // equals what issuance sealed.
  const { content_hash, ...body } = got.document;
  assert.equal(content_hash, canonicalFingerprint(body));
  assert.equal(issued.receiptId, "rc_1");
});

test("EXPIRED is computed at the resolve-time boundary (>=)", () => {
  const { svc, issue, setNow } = harness();
  issue();

  // 1ms before expiry: still ISSUED.
  setNow(new Date(Date.parse(EXPIRY) - 1).toISOString());
  let got = svc.getReceipt(PROJECT, "rc_1");
  assert.equal(got.expired, false);
  assert.equal(got.effective_status, "ISSUED");

  // Exactly at expiry: EXPIRED (>= boundary, same as DENY_EXPIRED).
  setNow(EXPIRY);
  got = svc.getReceipt(PROJECT, "rc_1");
  assert.equal(got.expired, true);
  assert.equal(got.effective_status, "EXPIRED");

  // After expiry: still EXPIRED; stored status untouched.
  setNow("2026-07-20T00:00:00Z");
  got = svc.getReceipt(PROJECT, "rc_1");
  assert.equal(got.effective_status, "EXPIRED");
  assert.equal(got.state, "ISSUED");
});

test("CONSUMED is derived from the in-service ledger; EXPIRED outranks it", () => {
  const { svc, ctx, issue, setNow } = harness();
  issue();

  const decision = svc.consumeReceipt(PROJECT, "rc_1", ctx);
  assert.equal(decision.code, "ALLOW");

  let got = svc.getReceipt(PROJECT, "rc_1");
  assert.equal(got.consumed, true);
  assert.equal(got.effective_status, "CONSUMED");
  assert.equal(got.state, "ISSUED"); // status is unchanged by consume

  // Precedence: a consumed-then-expired receipt reads EXPIRED.
  setNow(EXPIRY);
  got = svc.getReceipt(PROJECT, "rc_1");
  assert.equal(got.consumed, true);
  assert.equal(got.expired, true);
  assert.equal(got.effective_status, "EXPIRED");
});

test("SUPERSEDED and REVOKED pass through effective_status", () => {
  // SUPERSEDED: compact the head; the parent v1 becomes SUPERSEDED.
  const s = harness();
  s.issue();
  const comp = receiptDoc({ version: 2, source_references: ["s1"], allowed_tools: ["read"], authority_scope: ["src/services"] });
  s.svc.compactReceipt(PROJECT, "rc_1", comp, { idempotencyKey: "idem_comp" });

  const parent = s.svc.getReceipt(PROJECT, "rc_1", 1);
  assert.equal(parent.state, "SUPERSEDED");
  assert.equal(parent.effective_status, "SUPERSEDED");
  const head = s.svc.getReceipt(PROJECT, "rc_1");
  assert.equal(head.version, 2);
  assert.equal(head.effective_status, "ISSUED");

  // REVOKED: revoke the chain; every version reads REVOKED.
  const r = harness();
  r.issue();
  r.svc.revokeReceipt(PROJECT, "rc_1", { actorId: "gov", role: "GOV" });
  const got = r.svc.getReceipt(PROJECT, "rc_1");
  assert.equal(got.state, "REVOKED");
  assert.equal(got.effective_status, "REVOKED");
  assert.equal(got.consumed, false);
});

test("the returned projection and its lifecycle facets are frozen", () => {
  const { svc, issue } = harness();
  issue();
  const got = svc.getReceipt(PROJECT, "rc_1");
  assert.ok(Object.isFrozen(got), "return object frozen");
  assert.ok(Object.isFrozen(got.document), "nested document frozen");
  assert.throws(() => { got.effective_status = "TAMPER"; }, TypeError);
  assert.throws(() => { got.expired = true; }, TypeError);
});

test("getReceipt still denies unknown receipts and versions", () => {
  const { svc, issue } = harness();
  issue();
  assert.throws(() => svc.getReceipt(PROJECT, "nope"), (e) => e instanceof ContextFederationError && e.code === "DENY_UNKNOWN_RECEIPT");
  assert.throws(() => svc.getReceipt(PROJECT, "rc_1", 9), (e) => e instanceof ContextFederationError && e.code === "DENY_UNKNOWN_RECEIPT");
});
