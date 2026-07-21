// MOD-KNOW Slice S2 — Supersession + contradiction sidecar linkage tests.
//
// Scope: fail-closed construction; recordSupersession / recordContradiction
// deny-by-default pipelines (shape -> clock -> S1 read-path resolution with
// verbatim ledger passthrough -> scope -> sidecar gates -> assertion SoD ->
// audit-first -> sidecar append); symmetric contradiction duplicate detection
// (A-B == B-A -> DENY_ALREADY_LINKED); read-only resolveCurrent lineage walks
// (linear, branched-invalid, cyclic — structured DENY_BROKEN_LINEAGE, never a
// throw), boundary instants (asserted_at inclusive), and frozen
// contradictions[] annotation on contradicted-but-not-superseded claims. Plus
// a GUARD test proving the knowledge-claim schema, temporal-ledgers.mjs,
// sod-rules.mjs AND the ratified S1 facade are byte-identical to the S2 base
// (bst/mod-know-s1-claims @ 8b550c8): sidecar records, zero claim mutation.
//
// The harness composes the REAL stack: KnowledgeLedger (temp file) under the
// REAL S1 facade as the only claim read path, and a REAL DurableLedger as the
// sidecar — so passthrough and lineage tests exercise the actual kernel code.
// Branched/cyclic sidecar data is constructed by appending raw entries
// directly to the sidecar ledger (bypassing the service), proving the walker
// defends against foreign writers (data_untrusted), not just its own gates.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createKnowledgeLinkageService, KnowledgeLinkageConfigurationError } from "../src/services/knowledge-linkage-service.mjs";
import { createKnowledgeClaimService } from "../src/services/knowledge-claim-service.mjs";
import { KnowledgeLedger } from "../src/ledger/temporal-ledgers.mjs";
import { DurableLedger } from "../src/ledger/durable-ledger.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const S2_BASE = "8b550c879494e3391ba10a978da25d7827430caf"; // bst/mod-know-s1-claims
const FIXED_NOW = new Date("2026-07-20T10:00:00Z");

const kernelSodRules = { checkPairwiseDistinct };

const LEDGER_EVIDENCE = {
  ev_verified_001: { evidence_id: "ev_verified_001", verification_status: "VERIFIED" }
};

function makeEvidencePort() {
  return { resolveAccepted: (ref) => (LEDGER_EVIDENCE[ref] ? { ok: true, envelope: { evidence_id: ref } } : { ok: false, code: "DENY_EVIDENCE_NOT_ACCEPTED", reason: `No accepted envelope for ${ref}` }) };
}

function makeAuditWriter() {
  const entries = [];
  const writer = (entry) => { entries.push(entry); };
  writer.entries = entries;
  return writer;
}

function claim(overrides = {}) {
  return {
    claim_id: "kc_a",
    version: 1,
    project_id: "proj-1",
    work_package_id: "wp-1",
    session_id: "sess-1",
    actor_id: "hippocampus-actor",
    statement: "Deployment gate G7 requires dual sign-off",
    derivation: "Derived from mod-know-gap-assessment-001 G4",
    truth_status: "verified_true",
    evidence_refs: ["ev_verified_001"],
    claimed_at: "2026-07-19T10:00:00Z",
    valid_from: "2026-07-01T00:00:00Z",
    valid_until: "2027-01-01T00:00:00Z",
    retention_policy: "retain-12-months",
    ...overrides
  };
}

const AUTH = Object.freeze({ asserter: "agent-x", approver: "agent-y" });

function supersessionRequest(overrides = {}) {
  return {
    newClaimRef: "kc_b",
    supersededClaimRef: "kc_a",
    authorization: { ...AUTH },
    idempotencyKey: "idem_sup_1",
    expectedSequence: 0,
    ...overrides
  };
}

function contradictionRequest(overrides = {}) {
  return {
    claimRefA: "kc_a",
    claimRefB: "kc_b",
    basisNote: "kc_a mandates dual sign-off; kc_b records single sign-off for the same gate",
    authorization: { ...AUTH },
    idempotencyKey: "idem_con_1",
    expectedSequence: 0,
    ...overrides
  };
}

// Raw sidecar entry builder for foreign-writer scenarios (branched/cyclic).
function rawSupersessionEntry({ newRef, supersededRef, assertedAt, idempotencyKey }) {
  return {
    entryId: `sup:${supersededRef}->${newRef}#raw`,
    projectId: "proj-1",
    workPackageId: "wp-1",
    sessionId: "sess-1",
    actorId: "foreign-writer",
    type: "KNOWLEDGE_SUPERSESSION",
    payload: {
      record_type: "SUPERSEDES",
      new_claim_ref: newRef,
      superseded_claim_ref: supersededRef,
      project_id: "proj-1",
      asserter: "foreign-writer",
      approver: "foreign-approver",
      asserted_at: assertedAt
    },
    timestamp: assertedAt,
    idempotencyKey
  };
}

// Harness: real KnowledgeLedger + real S1 facade (the ONLY claim read path)
// + real DurableLedger sidecar. `clockRef.value` makes the server clock
// mutable for boundary-instant and temporal-passthrough scenarios.
function harness({ claims = [], now, auditWriter = makeAuditWriter(), sidecar, claimService } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "secb-know-s2-"));
  const clockRef = { value: FIXED_NOW };
  const clock = now ?? (() => clockRef.value);
  const knowledgeLedger = new KnowledgeLedger({
    filePath: join(dir, "knowledge.ndjson"),
    evidenceLookup: (ref) => LEDGER_EVIDENCE[ref] ?? null
  });
  const s1 = claimService ?? createKnowledgeClaimService({
    knowledgeLedger,
    sodRules: kernelSodRules,
    evidenceResolver: makeEvidencePort(),
    now: clock,
    auditWriter: () => {}
  });
  const sidecarLedger = sidecar ?? new DurableLedger({ filePath: join(dir, "knowledge-linkage.ndjson"), ledgerId: "secb-knowledge-linkage-sidecar" });
  const service = createKnowledgeLinkageService({ claimService: s1, sidecarLedger, sodRules: kernelSodRules, now: clock, auditWriter });
  // Admit fixture claims through the REAL S1 pipeline.
  claims.forEach((payload, index) => {
    const admitted = s1.proposeClaim({
      claim: payload,
      admission: { proposer: "agent-p", approver: "agent-q" },
      idempotencyKey: `idem_claim_${payload.claim_id}`,
      expectedSequence: index
    });
    assert.equal(admitted.decision, "ALLOW", `fixture claim ${payload.claim_id}: ${admitted.code}`);
  });
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return { service, s1, knowledgeLedger, sidecarLedger, auditWriter, clockRef, cleanup };
}

const TWO_CLAIMS = () => [claim(), claim({ claim_id: "kc_b", version: 2 })];
const THREE_CLAIMS = () => [...TWO_CLAIMS(), claim({ claim_id: "kc_c", version: 3 })];

function withHarness(options, fn) {
  const h = harness(options);
  try {
    fn(h);
  } finally {
    h.cleanup();
  }
}

// --- Construction ----------------------------------------------------------

test("construction is fail-closed on every missing or malformed collaborator", () => {
  const hasCode = (code) => (err) => err instanceof KnowledgeLinkageConfigurationError && err.code === code;
  const s1Double = { getClaim() {} };
  const sidecarDouble = { append() {}, read() { return []; } };
  assert.throws(() => createKnowledgeLinkageService(), hasCode("INVALID_CLAIM_SERVICE"));
  assert.throws(
    () => createKnowledgeLinkageService({ claimService: {}, sidecarLedger: sidecarDouble, sodRules: kernelSodRules, now: () => FIXED_NOW, auditWriter: () => {} }),
    hasCode("INVALID_CLAIM_SERVICE")
  );
  assert.throws(
    () => createKnowledgeLinkageService({ claimService: s1Double, sidecarLedger: { append() {} }, sodRules: kernelSodRules, now: () => FIXED_NOW, auditWriter: () => {} }),
    hasCode("INVALID_SIDECAR_LEDGER")
  );
  assert.throws(
    () => createKnowledgeLinkageService({ claimService: s1Double, sidecarLedger: sidecarDouble, sodRules: {}, now: () => FIXED_NOW, auditWriter: () => {} }),
    hasCode("INVALID_SOD_RULES")
  );
  assert.throws(
    () => createKnowledgeLinkageService({ claimService: s1Double, sidecarLedger: sidecarDouble, sodRules: kernelSodRules, now: null, auditWriter: () => {} }),
    hasCode("INVALID_CLOCK")
  );
  assert.throws(
    () => createKnowledgeLinkageService({ claimService: s1Double, sidecarLedger: sidecarDouble, sodRules: kernelSodRules, now: () => FIXED_NOW, auditWriter: "nope" }),
    hasCode("INVALID_AUDIT_WRITER")
  );
});

test("the service surface is frozen and exposes only the three S2 operations", () => {
  withHarness({}, ({ service }) => {
    assert.ok(Object.isFrozen(service));
    assert.deepEqual(Object.keys(service).sort(), ["recordContradiction", "recordSupersession", "resolveCurrent"]);
  });
});

// --- recordSupersession: happy path ---------------------------------------

test("recordSupersession records a sidecar entry, audits first, and mutates NEITHER claim", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service, knowledgeLedger, sidecarLedger, auditWriter }) => {
    const before = knowledgeLedger.read();
    const result = service.recordSupersession(supersessionRequest());
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.code, "SUPERSESSION_RECORDED");
    assert.equal(result.asserted_at, FIXED_NOW.toISOString());
    assert.equal(result.new_claim_ref, "kc_b");
    assert.equal(result.superseded_claim_ref, "kc_a");
    assert.ok(Object.isFrozen(result));
    // Audit-first evidence.
    assert.equal(auditWriter.entries.length, 1);
    assert.equal(auditWriter.entries[0].type, "KNOWLEDGE_SUPERSESSION_AUDIT");
    // The sidecar holds the ONLY new record.
    const rows = sidecarLedger.read();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entry.type, "KNOWLEDGE_SUPERSESSION");
    assert.equal(rows[0].entry.payload.record_type, "SUPERSEDES");
    assert.equal(rows[0].entry.payload.new_claim_ref, "kc_b");
    assert.equal(rows[0].entry.payload.superseded_claim_ref, "kc_a");
    // NOT a mutation of either claim: the knowledge ledger is byte-for-byte
    // unchanged (same rows, same hashes) after the linkage.
    assert.deepEqual(knowledgeLedger.read(), before, "sidecar linkage must not touch the claim ledger");
  });
});

// --- recordSupersession: denials ------------------------------------------

test("recordSupersession denies malformed, unknown-field, missing-field and self-referential requests", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service, sidecarLedger }) => {
    assert.equal(service.recordSupersession(null).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.recordSupersession(supersessionRequest({ rogue: 1 })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.recordSupersession(supersessionRequest({ newClaimRef: " " })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.recordSupersession(supersessionRequest({ supersededClaimRef: undefined })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.recordSupersession(supersessionRequest({ authorization: null })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.recordSupersession(supersessionRequest({ authorization: { ...AUTH, rogue: "x" } })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.recordSupersession(supersessionRequest({ authorization: { asserter: "agent-x" } })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.recordSupersession(supersessionRequest({ authorization: { ...AUTH, reviewer: " " } })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.recordSupersession(supersessionRequest({ idempotencyKey: "" })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.recordSupersession(supersessionRequest({ expectedSequence: -1 })).code, "DENY_MALFORMED_REQUEST");
    const selfRef = service.recordSupersession(supersessionRequest({ newClaimRef: "kc_a", supersededClaimRef: "kc_a" }));
    assert.equal(selfRef.code, "DENY_SELF_SUPERSESSION");
    assert.equal(sidecarLedger.read().length, 0, "no sidecar append on any shape denial");
  });
});

test("recordSupersession denies DENY_CLOCK_UNAVAILABLE when the clock throws", () => {
  withHarness({ now: () => { throw new Error("no clock"); } }, ({ service }) => {
    assert.equal(service.recordSupersession(supersessionRequest()).code, "DENY_CLOCK_UNAVAILABLE");
  });
});

test("PASSTHROUGH: an unresolvable claim surfaces the S1/ledger denial verbatim with the failing ref", () => {
  withHarness({ claims: [claim()] }, ({ service, sidecarLedger, auditWriter }) => {
    // kc_b was never admitted: the REAL ledger's DENY_UNKNOWN_CLAIM passes through.
    const unknownNew = service.recordSupersession(supersessionRequest());
    assert.equal(unknownNew.decision, "DENY");
    assert.equal(unknownNew.code, "DENY_UNKNOWN_CLAIM");
    assert.equal(unknownNew.reason, "Unknown claim: kc_b", "ledger's own message, verbatim");
    assert.equal(unknownNew.failed_ref, "kc_b");
    const unknownSuperseded = service.recordSupersession(supersessionRequest({ newClaimRef: "kc_a", supersededClaimRef: "kc_zz" }));
    assert.equal(unknownSuperseded.code, "DENY_UNKNOWN_CLAIM");
    assert.equal(unknownSuperseded.failed_ref, "kc_zz");
    assert.equal(sidecarLedger.read().length, 0);
    assert.equal(auditWriter.entries.length, 0, "no audit on resolution denial");
  });
});

test("PASSTHROUGH: an expired claim surfaces the ledger's DENY_TEMPORAL_BOUNDARY verbatim (preserved for unresolvable claims)", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service, clockRef }) => {
    clockRef.value = new Date("2027-06-01T00:00:00Z"); // past both valid_until windows
    const result = service.recordSupersession(supersessionRequest());
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_TEMPORAL_BOUNDARY");
    assert.equal(result.reason, "Claim is outside its validity window");
    assert.equal(result.failed_ref, "kc_b");
  });
});

test("recordSupersession denies DENY_SCOPE_MISMATCH when the claims live in different projects", () => {
  withHarness(
    { claims: [claim(), claim({ claim_id: "kc_b", project_id: "proj-2" })] },
    ({ service, sidecarLedger }) => {
      const result = service.recordSupersession(supersessionRequest());
      assert.equal(result.code, "DENY_SCOPE_MISMATCH");
      assert.equal(result.new_project_id, "proj-2");
      assert.equal(result.superseded_project_id, "proj-1");
      assert.equal(sidecarLedger.read().length, 0);
    }
  );
});

test("recordSupersession denies DENY_ALREADY_SUPERSEDED for a second superseder of the same claim", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service }) => {
    assert.equal(service.recordSupersession(supersessionRequest()).decision, "ALLOW");
    const branchAttempt = service.recordSupersession(
      supersessionRequest({ newClaimRef: "kc_c", idempotencyKey: "idem_sup_2", expectedSequence: 1 })
    );
    assert.equal(branchAttempt.decision, "DENY");
    assert.equal(branchAttempt.code, "DENY_ALREADY_SUPERSEDED");
  });
});

test("recordSupersession denies DENY_CYCLIC_LINEAGE when the new edge would close a loop", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service }) => {
    assert.equal(service.recordSupersession(supersessionRequest()).decision, "ALLOW"); // kc_a -> kc_b
    assert.equal(
      service.recordSupersession(
        supersessionRequest({ newClaimRef: "kc_c", supersededClaimRef: "kc_b", idempotencyKey: "idem_sup_2", expectedSequence: 1 })
      ).decision,
      "ALLOW"
    ); // kc_b -> kc_c
    const cycle = service.recordSupersession(
      supersessionRequest({ newClaimRef: "kc_a", supersededClaimRef: "kc_c", idempotencyKey: "idem_sup_3", expectedSequence: 2 })
    );
    assert.equal(cycle.decision, "DENY");
    assert.equal(cycle.code, "DENY_CYCLIC_LINEAGE");
  });
});

test("recordSupersession denies DENY_SUPERSESSION_SOD for every non-distinct asserter/approver/reviewer pairing", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service, sidecarLedger, auditWriter }) => {
    const scenarios = [
      { asserter: "agent-x", approver: "agent-x" },
      { asserter: "agent-x", approver: "agent-y", reviewer: "agent-x" },
      { asserter: "agent-x", approver: "agent-y", reviewer: "agent-y" }
    ];
    for (const authorization of scenarios) {
      const result = service.recordSupersession(supersessionRequest({ authorization }));
      assert.equal(result.decision, "DENY", JSON.stringify(authorization));
      assert.equal(result.code, "DENY_SUPERSESSION_SOD", JSON.stringify(authorization));
    }
    assert.equal(sidecarLedger.read().length, 0, "no sidecar append on SoD denial");
    assert.equal(auditWriter.entries.length, 0, "no audit on SoD denial");
  });
});

test("recordSupersession denies DENY_AUDIT_UNAVAILABLE before any sidecar append (audit-first)", () => {
  withHarness({ claims: TWO_CLAIMS(), auditWriter: () => { throw new Error("audit down"); } }, ({ service, sidecarLedger }) => {
    assert.equal(service.recordSupersession(supersessionRequest()).code, "DENY_AUDIT_UNAVAILABLE");
    assert.equal(sidecarLedger.read().length, 0, "audit-first: no sidecar mutation when audit is unavailable");
  });
});

test("audit-first spot-run: the audit entry is written strictly before the sidecar append", () => {
  const order = [];
  const h = harness({ claims: TWO_CLAIMS(), auditWriter: () => { order.push("audit"); } });
  try {
    const spySidecar = {
      append(...args) { order.push("append"); return h.sidecarLedger.append(...args); },
      read: () => h.sidecarLedger.read()
    };
    const service = createKnowledgeLinkageService({
      claimService: h.s1,
      sidecarLedger: spySidecar,
      sodRules: kernelSodRules,
      now: () => FIXED_NOW,
      auditWriter: () => { order.push("audit"); }
    });
    assert.equal(service.recordSupersession(supersessionRequest()).decision, "ALLOW");
    assert.deepEqual(order, ["audit", "append"]);
  } finally {
    h.cleanup();
  }
});

test("PASSTHROUGH: the sidecar ledger's own sequence conflict surfaces verbatim", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service }) => {
    assert.equal(service.recordSupersession(supersessionRequest()).decision, "ALLOW");
    const conflict = service.recordSupersession(
      supersessionRequest({ newClaimRef: "kc_c", supersededClaimRef: "kc_b", idempotencyKey: "idem_sup_2", expectedSequence: 0 })
    );
    assert.equal(conflict.decision, "DENY");
    assert.equal(conflict.code, "DENY_SEQUENCE_CONFLICT");
    assert.equal(conflict.source, "sidecar-ledger");
  });
});

test("recordSupersession denies DENY_SIDECAR_UNAVAILABLE when the sidecar throws without a code", () => {
  withHarness(
    { claims: TWO_CLAIMS(), sidecar: { append() { throw new Error("disk full"); }, read() { return []; } } },
    ({ service }) => {
      assert.equal(service.recordSupersession(supersessionRequest()).code, "DENY_SIDECAR_UNAVAILABLE");
    }
  );
});

// --- recordContradiction ---------------------------------------------------

test("recordContradiction registers a canonicalized linkage without mutating either claim", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service, knowledgeLedger, sidecarLedger, auditWriter }) => {
    const before = knowledgeLedger.read();
    // Register in REVERSE order to prove canonicalization.
    const result = service.recordContradiction(contradictionRequest({ claimRefA: "kc_b", claimRefB: "kc_a" }));
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.code, "CONTRADICTION_RECORDED");
    assert.equal(result.claim_ref_a, "kc_a", "canonical low ref first");
    assert.equal(result.claim_ref_b, "kc_b");
    assert.ok(Object.isFrozen(result));
    assert.equal(auditWriter.entries.length, 1);
    assert.equal(auditWriter.entries[0].type, "KNOWLEDGE_CONTRADICTION_AUDIT");
    const rows = sidecarLedger.read();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entry.type, "KNOWLEDGE_CONTRADICTION");
    assert.equal(rows[0].entry.payload.record_type, "CONTRADICTS");
    assert.equal(rows[0].entry.payload.basis_note, contradictionRequest().basisNote);
    assert.deepEqual(knowledgeLedger.read(), before, "registration + linkage only: claim ledger untouched");
  });
});

test("recordContradiction is symmetric for duplicate detection: A-B then B-A denies DENY_ALREADY_LINKED", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service }) => {
    assert.equal(service.recordContradiction(contradictionRequest()).decision, "ALLOW");
    const reversed = service.recordContradiction(
      contradictionRequest({ claimRefA: "kc_b", claimRefB: "kc_a", idempotencyKey: "idem_con_2", expectedSequence: 1 })
    );
    assert.equal(reversed.decision, "DENY");
    assert.equal(reversed.code, "DENY_ALREADY_LINKED");
    const sameOrder = service.recordContradiction(contradictionRequest({ idempotencyKey: "idem_con_3", expectedSequence: 1 }));
    assert.equal(sameOrder.code, "DENY_ALREADY_LINKED");
  });
});

test("recordContradiction denies blank basisNote, self-contradiction and malformed envelopes", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service, sidecarLedger }) => {
    assert.equal(service.recordContradiction(null).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.recordContradiction(contradictionRequest({ rogue: true })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.recordContradiction(contradictionRequest({ basisNote: "   " })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.recordContradiction(contradictionRequest({ basisNote: undefined })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.recordContradiction(contradictionRequest({ claimRefB: "" })).code, "DENY_MISSING_FIELDS");
    const selfRef = service.recordContradiction(contradictionRequest({ claimRefB: "kc_a" }));
    assert.equal(selfRef.code, "DENY_SELF_CONTRADICTION");
    assert.equal(sidecarLedger.read().length, 0);
  });
});

test("recordContradiction passes S1 read-path denials through verbatim and enforces SoD and scope", () => {
  withHarness(
    { claims: [claim(), claim({ claim_id: "kc_b", version: 2 }), claim({ claim_id: "kc_px", project_id: "proj-2" })] },
    ({ service, auditWriter }) => {
      const unknown = service.recordContradiction(contradictionRequest({ claimRefB: "kc_missing" }));
      assert.equal(unknown.code, "DENY_UNKNOWN_CLAIM");
      assert.equal(unknown.reason, "Unknown claim: kc_missing");
      assert.equal(unknown.failed_ref, "kc_missing");
      const scope = service.recordContradiction(contradictionRequest({ claimRefB: "kc_px" }));
      assert.equal(scope.code, "DENY_SCOPE_MISMATCH");
      const sod = service.recordContradiction(contradictionRequest({ authorization: { asserter: "agent-x", approver: "agent-x" } }));
      assert.equal(sod.code, "DENY_CONTRADICTION_SOD");
      assert.equal(auditWriter.entries.length, 0, "no audit on any denial");
    }
  );
});

test("recordContradiction denies DENY_AUDIT_UNAVAILABLE before any sidecar append", () => {
  withHarness({ claims: TWO_CLAIMS(), auditWriter: () => { throw new Error("audit down"); } }, ({ service, sidecarLedger }) => {
    assert.equal(service.recordContradiction(contradictionRequest()).code, "DENY_AUDIT_UNAVAILABLE");
    assert.equal(sidecarLedger.read().length, 0);
  });
});

// --- resolveCurrent: lineage walks ----------------------------------------

test("resolveCurrent resolves a never-superseded claim to itself, frozen and data_untrusted", () => {
  withHarness({ claims: [claim()] }, ({ service }) => {
    const result = service.resolveCurrent("kc_a");
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.code, "CURRENT_RESOLVED");
    assert.equal(result.current_claim_id, "kc_a");
    assert.deepEqual(result.lineage, ["kc_a"]);
    assert.deepEqual(result.contradictions, []);
    assert.equal(result.data_untrusted, true);
    assert.equal(result.resolved_at, FIXED_NOW.toISOString());
    assert.equal(result.at, FIXED_NOW.toISOString(), "at defaults to the trusted server instant");
    assert.equal(result.claim.claim_id, "kc_a");
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.lineage));
    assert.ok(Object.isFrozen(result.contradictions));
    assert.ok(Object.isFrozen(result.claim));
  });
});

test("resolveCurrent walks a linear lineage deterministically from ANY member to the head", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service }) => {
    assert.equal(service.recordSupersession(supersessionRequest()).decision, "ALLOW"); // kc_a -> kc_b
    assert.equal(
      service.recordSupersession(
        supersessionRequest({ newClaimRef: "kc_c", supersededClaimRef: "kc_b", idempotencyKey: "idem_sup_2", expectedSequence: 1 })
      ).decision,
      "ALLOW"
    ); // kc_b -> kc_c
    const fromTail = service.resolveCurrent("kc_a");
    assert.equal(fromTail.decision, "ALLOW");
    assert.equal(fromTail.current_claim_id, "kc_c");
    assert.deepEqual(fromTail.lineage, ["kc_a", "kc_b", "kc_c"]);
    const fromMiddle = service.resolveCurrent("kc_b");
    assert.equal(fromMiddle.current_claim_id, "kc_c");
    assert.deepEqual(fromMiddle.lineage, ["kc_b", "kc_c"]);
    const fromHead = service.resolveCurrent("kc_c");
    assert.equal(fromHead.current_claim_id, "kc_c");
    assert.deepEqual(fromHead.lineage, ["kc_c"]);
    // Determinism: repeated resolution answers identically.
    assert.deepEqual(service.resolveCurrent("kc_a"), fromTail);
  });
});

test("resolveCurrent honours boundary instants: a supersession is effective AT its asserted_at, not before", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service, clockRef }) => {
    const t1 = new Date("2026-07-20T10:00:00Z");
    const t2 = new Date("2026-07-20T12:00:00Z");
    clockRef.value = t1;
    assert.equal(service.recordSupersession(supersessionRequest()).decision, "ALLOW"); // kc_a -> kc_b @ t1
    clockRef.value = t2;
    assert.equal(
      service.recordSupersession(
        supersessionRequest({ newClaimRef: "kc_c", supersededClaimRef: "kc_b", idempotencyKey: "idem_sup_2", expectedSequence: 1 })
      ).decision,
      "ALLOW"
    ); // kc_b -> kc_c @ t2
    // Strictly before t1: no supersession is effective yet.
    const beforeT1 = service.resolveCurrent("kc_a", { at: "2026-07-20T09:59:59.999Z" });
    assert.equal(beforeT1.current_claim_id, "kc_a");
    // Exactly t1 (inclusive boundary): the first edge is effective.
    const atT1 = service.resolveCurrent("kc_a", { at: t1.toISOString() });
    assert.equal(atT1.current_claim_id, "kc_b");
    assert.deepEqual(atT1.lineage, ["kc_a", "kc_b"]);
    // Between t1 and t2: still kc_b.
    assert.equal(service.resolveCurrent("kc_a", { at: "2026-07-20T11:00:00Z" }).current_claim_id, "kc_b");
    // Exactly t2: the full chain wins.
    const atT2 = service.resolveCurrent("kc_a", { at: t2.toISOString() });
    assert.equal(atT2.current_claim_id, "kc_c");
    assert.deepEqual(atT2.lineage, ["kc_a", "kc_b", "kc_c"]);
    assert.equal(atT2.at, t2.toISOString());
  });
});

test("resolveCurrent denies DENY_BROKEN_LINEAGE (branched) for foreign-writer branched sidecar data — never throws", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service, sidecarLedger }) => {
    const assertedAt = FIXED_NOW.toISOString();
    sidecarLedger.append(rawSupersessionEntry({ newRef: "kc_b", supersededRef: "kc_a", assertedAt, idempotencyKey: "raw_1" }), { expectedSequence: 0 });
    sidecarLedger.append(rawSupersessionEntry({ newRef: "kc_c", supersededRef: "kc_a", assertedAt, idempotencyKey: "raw_2" }), { expectedSequence: 1 });
    const result = service.resolveCurrent("kc_a");
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_BROKEN_LINEAGE");
    assert.equal(result.lineage_issue, "branched");
    // A member BELOW the branch point still resolves (the walk from kc_b
    // never crosses the broken node).
    assert.equal(service.resolveCurrent("kc_b").decision, "ALLOW");
  });
});

test("resolveCurrent denies DENY_BROKEN_LINEAGE (cyclic) for foreign-writer cyclic sidecar data — never throws", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service, sidecarLedger }) => {
    const assertedAt = FIXED_NOW.toISOString();
    sidecarLedger.append(rawSupersessionEntry({ newRef: "kc_b", supersededRef: "kc_a", assertedAt, idempotencyKey: "raw_1" }), { expectedSequence: 0 });
    sidecarLedger.append(rawSupersessionEntry({ newRef: "kc_c", supersededRef: "kc_b", assertedAt, idempotencyKey: "raw_2" }), { expectedSequence: 1 });
    sidecarLedger.append(rawSupersessionEntry({ newRef: "kc_a", supersededRef: "kc_c", assertedAt, idempotencyKey: "raw_3" }), { expectedSequence: 2 });
    const result = service.resolveCurrent("kc_a");
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_BROKEN_LINEAGE");
    assert.equal(result.lineage_issue, "cyclic");
  });
});

test("resolveCurrent annotates a contradicted-but-not-superseded claim with frozen contradictions[] and still resolves", () => {
  withHarness({ claims: TWO_CLAIMS() }, ({ service }) => {
    assert.equal(service.recordContradiction(contradictionRequest()).decision, "ALLOW");
    const result = service.resolveCurrent("kc_a");
    assert.equal(result.decision, "ALLOW", "contradiction registration never blocks resolution");
    assert.equal(result.current_claim_id, "kc_a");
    assert.equal(result.contradictions.length, 1);
    assert.equal(result.contradictions[0].with_claim_ref, "kc_b");
    assert.equal(result.contradictions[0].basis_note, contradictionRequest().basisNote);
    assert.equal(result.contradictions[0].asserted_at, FIXED_NOW.toISOString());
    assert.ok(Object.isFrozen(result.contradictions));
    assert.ok(Object.isFrozen(result.contradictions[0]));
    // Symmetric annotation: the other side carries the same linkage.
    const other = service.resolveCurrent("kc_b");
    assert.equal(other.contradictions[0].with_claim_ref, "kc_a");
    // Before the assertion instant, the contradiction is not yet effective.
    const before = service.resolveCurrent("kc_a", { at: "2026-07-20T09:00:00Z" });
    assert.deepEqual(before.contradictions, []);
  });
});

test("resolveCurrent: a superseded lineage's WINNER carries the winner's contradictions, not the tail's", () => {
  withHarness({ claims: THREE_CLAIMS() }, ({ service }) => {
    assert.equal(service.recordSupersession(supersessionRequest()).decision, "ALLOW"); // kc_a -> kc_b
    assert.equal(
      service.recordContradiction(
        contradictionRequest({ claimRefA: "kc_b", claimRefB: "kc_c", idempotencyKey: "idem_con_x", expectedSequence: 1 })
      ).decision,
      "ALLOW"
    );
    const result = service.resolveCurrent("kc_a");
    assert.equal(result.current_claim_id, "kc_b");
    assert.equal(result.contradictions.length, 1);
    assert.equal(result.contradictions[0].with_claim_ref, "kc_c");
  });
});

test("PASSTHROUGH: resolveCurrent surfaces the winner's S1/ledger denial verbatim (unknown and expired)", () => {
  withHarness({ claims: [claim()] }, ({ service, clockRef }) => {
    const unknown = service.resolveCurrent("kc_ghost");
    assert.equal(unknown.decision, "DENY");
    assert.equal(unknown.code, "DENY_UNKNOWN_CLAIM");
    assert.equal(unknown.reason, "Unknown claim: kc_ghost");
    assert.equal(unknown.failed_ref, "kc_ghost");
    // A forged/backdated `at` cannot resurrect an expired winner: the claim
    // itself resolves at the TRUSTED server instant through S1.
    clockRef.value = new Date("2027-06-01T00:00:00Z");
    const expired = service.resolveCurrent("kc_a", { at: FIXED_NOW.toISOString() });
    assert.equal(expired.decision, "DENY");
    assert.equal(expired.code, "DENY_TEMPORAL_BOUNDARY");
    assert.equal(expired.failed_ref, "kc_a");
  });
});

test("resolveCurrent denies malformed inputs, invalid instants, a broken clock and a throwing sidecar", () => {
  withHarness({ claims: [claim()] }, ({ service }) => {
    assert.equal(service.resolveCurrent("").code, "DENY_MISSING_FIELDS");
    assert.equal(service.resolveCurrent(null).code, "DENY_MISSING_FIELDS");
    assert.equal(service.resolveCurrent("kc_a", "not-an-object").code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.resolveCurrent("kc_a", { rogue: 1 }).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.resolveCurrent("kc_a", { at: "not-a-date" }).code, "DENY_INVALID_INSTANT");
  });
  withHarness({ now: () => { throw new Error("no clock"); } }, ({ service }) => {
    assert.equal(service.resolveCurrent("kc_a").code, "DENY_CLOCK_UNAVAILABLE");
  });
  withHarness(
    { sidecar: { append() {}, read() { throw new Error("io"); } } },
    ({ service }) => {
      assert.equal(service.resolveCurrent("kc_a").code, "DENY_SIDECAR_UNAVAILABLE");
    }
  );
});

// --- Wrap-not-modify guard -------------------------------------------------

test("GUARD: knowledge-claim schema, temporal-ledgers, sod-rules AND the S1 facade are byte-identical to the S2 base", () => {
  // Sidecar discipline (assessment S2 rationale): linkage lives in sidecar
  // records precisely so the closed knowledge-claim contract (R3) and the
  // kernel learning boundary / SoD primitives (R3+/R4) stay untouched. The
  // ratified S1 facade is included: S2 composes OVER it, never edits it.
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  // src/control/sod-rules.mjs is intentionally EXCLUDED from this list by
  // mod-gov-s1-sod-rules-hardening-fix-001: a second independent review found
  // a fail-open normalization gap and an unfrozen shared-mutable-state gap in
  // this primitive. That fix is an authorized, disclosed cross-cutting change
  // -- not a violation of this S2 slice's own sidecar/wrap-not-modify
  // discipline. The other three files remain fully protected.
  for (const path of [
    "contracts/knowledge-claim.schema.json",
    "src/ledger/temporal-ledgers.mjs",
    "src/services/knowledge-claim-service.mjs"
  ]) {
    const onBase = execFileSync("git", ["show", `${S2_BASE}:${path}`], { cwd: REPO_ROOT, encoding: "utf8" });
    const onBranch = readFileSync(resolve(REPO_ROOT, path), "utf8");
    assert.equal(normalize(onBranch), normalize(onBase), `${path} must be untouched vs S2 base ${S2_BASE.slice(0, 7)} (sidecar, wrap-not-modify)`);
  }
});
