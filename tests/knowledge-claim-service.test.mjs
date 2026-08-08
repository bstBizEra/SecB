// MOD-KNOW Slice S1 — Knowledge claim lifecycle facade tests.
//
// Scope: fail-closed construction; the deny-by-default proposal pipeline
// (shape -> clock -> contract schema -> evidence port -> admission SoD ->
// audit-first -> DELEGATE to knowledgeLedger.appendClaim unchanged); verbatim
// passthrough of the ledger's own learning-boundary denials (never pre-empted,
// never reinterpreted); evidence-port denial passthrough; read-only frozen
// data_untrusted getClaim/listClaims. Plus a GUARD test proving
// temporal-ledgers.mjs and sod-rules.mjs are byte-identical to main
// (wrap-not-modify: R3+ hard line).
//
// The facade is UNWIRED: nothing in the runtime constructs it. The ledger
// under the facade is the REAL KnowledgeLedger over a temp file, so the
// learning boundary exercised here is the ledger's own code, not a double.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createKnowledgeClaimService, KnowledgeClaimConfigurationError } from "../src/services/knowledge-claim-service.mjs";
import { KnowledgeLedger } from "../src/ledger/temporal-ledgers.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const FIXED_NOW = new Date("2026-07-20T10:00:00Z");

// Kernel SoD primitive, reused config-only (no wrapper behavior added).
const kernelSodRules = { checkPairwiseDistinct };

// The ledger's OWN evidence lookup (learning-boundary input). Statuses cover
// the accepted set (VERIFIED/ACCEPTED), a not-yet-accepted envelope, and a
// miswired identity — so the ledger's own denials can be provoked verbatim.
const LEDGER_EVIDENCE = {
  ev_verified_001: { evidence_id: "ev_verified_001", verification_status: "VERIFIED" },
  ev_accepted_001: { evidence_id: "ev_accepted_001", verification_status: "ACCEPTED" },
  ev_captured_001: { evidence_id: "ev_captured_001", verification_status: "CAPTURED" },
  ev_miswired_001: { evidence_id: "ev_other_999", verification_status: "VERIFIED" }
};

// Injected MOD-EVID port DOUBLE ({ resolveAccepted(ref) -> {ok,envelope}|deny }).
// By default it resolves every ref the ledger knows about — including the ones
// the ledger itself will DENY — so passthrough tests prove the facade does not
// pre-empt the learning boundary.
function makeEvidencePort(known = Object.keys(LEDGER_EVIDENCE)) {
  return {
    resolveAccepted(ref) {
      if (known.includes(ref)) return { ok: true, envelope: { evidence_id: ref } };
      return { ok: false, code: "DENY_EVIDENCE_NOT_ACCEPTED", reason: `No accepted envelope for ${ref}` };
    }
  };
}

function makeAuditWriter() {
  const entries = [];
  const writer = (entry) => {
    entries.push(entry);
    return { audited: true };
  };
  writer.entries = entries;
  return writer;
}

function claim(overrides = {}) {
  return {
    claim_id: "kc_mod_know_s1_001",
    version: 1,
    project_id: "proj-1",
    work_package_id: "wp-1",
    session_id: "sess-1",
    actor_id: "hippocampus-actor",
    statement: "Admission SoD applies to every knowledge claim",
    derivation: "Derived from mod-know-gap-assessment-001 G2",
    truth_status: "verified_true",
    evidence_refs: ["ev_verified_001"],
    claimed_at: "2026-07-19T10:00:00Z",
    valid_from: "2026-07-19T10:00:00Z",
    valid_until: "2026-10-01T00:00:00Z",
    retention_policy: "retain-12-months",
    ...overrides
  };
}

function admission(overrides = {}) {
  return { proposer: "agent-a", approver: "agent-b", ...overrides };
}

function proposal(overrides = {}) {
  return {
    claim: claim(),
    admission: admission(),
    idempotencyKey: "idem_kc_1",
    expectedSequence: 0,
    ...overrides
  };
}

// Harness: REAL KnowledgeLedger over a temp file + injected doubles.
function harness({ now = () => FIXED_NOW, auditWriter = makeAuditWriter(), evidenceResolver = makeEvidencePort(), ledger } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "secb-know-s1-"));
  const knowledgeLedger =
    ledger ??
    new KnowledgeLedger({
      filePath: join(dir, "knowledge.ndjson"),
      evidenceLookup: (ref) => LEDGER_EVIDENCE[ref] ?? null
    });
  const service = createKnowledgeClaimService({ knowledgeLedger, sodRules: kernelSodRules, evidenceResolver, now, auditWriter });
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return { service, knowledgeLedger, auditWriter, cleanup };
}

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
  const hasCode = (code) => (err) => err instanceof KnowledgeClaimConfigurationError && err.code === code;
  const ledgerDouble = { appendClaim() {}, resolveClaim() {}, read() { return []; } };
  const port = makeEvidencePort();
  assert.throws(() => createKnowledgeClaimService(), hasCode("INVALID_KNOWLEDGE_LEDGER"));
  assert.throws(
    () => createKnowledgeClaimService({ knowledgeLedger: { appendClaim() {} }, sodRules: kernelSodRules, evidenceResolver: port, now: () => FIXED_NOW, auditWriter: () => {} }),
    hasCode("INVALID_KNOWLEDGE_LEDGER")
  );
  assert.throws(
    () => createKnowledgeClaimService({ knowledgeLedger: ledgerDouble, sodRules: {}, evidenceResolver: port, now: () => FIXED_NOW, auditWriter: () => {} }),
    hasCode("INVALID_SOD_RULES")
  );
  assert.throws(
    () => createKnowledgeClaimService({ knowledgeLedger: ledgerDouble, sodRules: kernelSodRules, evidenceResolver: {}, now: () => FIXED_NOW, auditWriter: () => {} }),
    hasCode("INVALID_EVIDENCE_RESOLVER")
  );
  assert.throws(
    () => createKnowledgeClaimService({ knowledgeLedger: ledgerDouble, sodRules: kernelSodRules, evidenceResolver: port, now: "not-a-function", auditWriter: () => {} }),
    hasCode("INVALID_CLOCK")
  );
  assert.throws(
    () => createKnowledgeClaimService({ knowledgeLedger: ledgerDouble, sodRules: kernelSodRules, evidenceResolver: port, now: () => FIXED_NOW, auditWriter: null }),
    hasCode("INVALID_AUDIT_WRITER")
  );
});

test("the service surface is frozen and exposes only proposeClaim, getClaim and listClaims", () => {
  withHarness({}, ({ service }) => {
    assert.ok(Object.isFrozen(service));
    assert.deepEqual(Object.keys(service).sort(), ["getClaim", "listClaims", "proposeClaim"]);
  });
});

// --- Proposal happy path ---------------------------------------------------

test("proposeClaim ADMITS a well-formed claim, stamps proposed_at, audits, and appends via the real ledger", () => {
  withHarness({}, ({ service, knowledgeLedger, auditWriter }) => {
    const result = service.proposeClaim(proposal());
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.code, "ADMITTED");
    assert.equal(result.proposed_at, FIXED_NOW.toISOString());
    assert.equal(result.claim_id, "kc_mod_know_s1_001");
    assert.ok(Object.isFrozen(result));
    assert.equal(auditWriter.entries.length, 1);
    assert.equal(auditWriter.entries[0].type, "KNOWLEDGE_ADMISSION_AUDIT");
    assert.equal(auditWriter.entries[0].proposer, "agent-a");
    assert.equal(auditWriter.entries[0].approver, "agent-b");
    const rows = knowledgeLedger.read();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entry.entryId, "kc_mod_know_s1_001");
    assert.equal(rows[0].entry.type, "KNOWLEDGE_CLAIM");
  });
});

test("proposeClaim ADMITS with a distinct reviewer present and with ACCEPTED evidence", () => {
  withHarness({}, ({ service }) => {
    const result = service.proposeClaim(
      proposal({
        claim: claim({ evidence_refs: ["ev_accepted_001"] }),
        admission: admission({ reviewer: "agent-c" })
      })
    );
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.code, "ADMITTED");
  });
});

// --- Stage 1: shape denials ------------------------------------------------

test("proposeClaim denies malformed / unknown-field / missing-field requests without throwing", () => {
  withHarness({}, ({ service, knowledgeLedger }) => {
    assert.equal(service.proposeClaim(null).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.proposeClaim(proposal({ rogue: 1 })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.proposeClaim(proposal({ claim: "not-an-object" })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.proposeClaim(proposal({ admission: null })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.proposeClaim(proposal({ admission: admission({ rogue: "x" }) })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.proposeClaim(proposal({ admission: { proposer: "agent-a" } })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.proposeClaim(proposal({ admission: admission({ proposer: " " }) })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.proposeClaim(proposal({ admission: admission({ reviewer: "" }) })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.proposeClaim(proposal({ idempotencyKey: "" })).code, "DENY_MISSING_FIELDS");
    assert.equal(service.proposeClaim(proposal({ expectedSequence: -1 })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.proposeClaim(proposal({ expectedSequence: "0" })).code, "DENY_MALFORMED_REQUEST");
    assert.equal(knowledgeLedger.read().length, 0, "no append on shape denial");
  });
});

// --- Stage 2: clock --------------------------------------------------------

test("proposeClaim denies DENY_CLOCK_UNAVAILABLE when the clock throws or returns NaN", () => {
  withHarness({ now: () => { throw new Error("no clock"); } }, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).code, "DENY_CLOCK_UNAVAILABLE");
  });
  withHarness({ now: () => new Date("not-a-date") }, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).code, "DENY_CLOCK_UNAVAILABLE");
  });
});

// --- Stage 3: contract schema ----------------------------------------------

test("proposeClaim denies DENY_CONTRACT_INVALID for a claim violating the existing knowledge-claim contract", () => {
  withHarness({}, ({ service, knowledgeLedger, auditWriter }) => {
    const missingField = service.proposeClaim(proposal({ claim: claim({ statement: undefined }) }));
    assert.equal(missingField.decision, "DENY");
    assert.equal(missingField.code, "DENY_CONTRACT_INVALID");
    const extraField = service.proposeClaim(proposal({ claim: claim({ rogue_field: true }) }));
    assert.equal(extraField.code, "DENY_CONTRACT_INVALID", "closed contract: additionalProperties denied");
    const badStatus = service.proposeClaim(proposal({ claim: claim({ truth_status: "certain" }) }));
    assert.equal(badStatus.code, "DENY_CONTRACT_INVALID");
    assert.equal(knowledgeLedger.read().length, 0, "no append on contract denial");
    assert.equal(auditWriter.entries.length, 0, "no audit on contract denial");
  });
});

// --- Stage 4: evidence port ------------------------------------------------

test("proposeClaim denies DENY_EVIDENCE_UNRESOLVED and passes the port's own denial through", () => {
  withHarness({ evidenceResolver: makeEvidencePort(["ev_verified_001"]) }, ({ service, knowledgeLedger, auditWriter }) => {
    const result = service.proposeClaim(proposal({ claim: claim({ evidence_refs: ["ev_unknown_404"] }) }));
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_EVIDENCE_UNRESOLVED");
    // Evidence-port denial passthrough: the port's own code and reason surface.
    assert.equal(result.port_denial.code, "DENY_EVIDENCE_NOT_ACCEPTED");
    assert.equal(result.port_denial.reason, "No accepted envelope for ev_unknown_404");
    assert.ok(Object.isFrozen(result.port_denial));
    assert.equal(knowledgeLedger.read().length, 0, "no append on evidence-port denial");
    assert.equal(auditWriter.entries.length, 0, "no audit on evidence-port denial");
  });
});

test("proposeClaim denies DENY_EVIDENCE_UNRESOLVED when the port throws or returns a malformed resolution", () => {
  withHarness({ evidenceResolver: { resolveAccepted: () => { throw new Error("port down"); } } }, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).code, "DENY_EVIDENCE_UNRESOLVED");
  });
  withHarness({ evidenceResolver: { resolveAccepted: () => ({ ok: true }) } }, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).code, "DENY_EVIDENCE_UNRESOLVED", "ok without envelope is not a resolution");
  });
});

// --- Stage 5: admission SoD ------------------------------------------------

test("proposeClaim denies DENY_ADMISSION_SOD for every non-distinct proposer/reviewer/approver pairing", () => {
  withHarness({}, ({ service, knowledgeLedger, auditWriter }) => {
    const scenarios = [
      admission({ proposer: "agent-a", approver: "agent-a" }),
      admission({ proposer: "agent-a", approver: "agent-b", reviewer: "agent-a" }),
      admission({ proposer: "agent-a", approver: "agent-b", reviewer: "agent-b" })
    ];
    for (const adm of scenarios) {
      const result = service.proposeClaim(proposal({ admission: adm }));
      assert.equal(result.decision, "DENY", JSON.stringify(adm));
      assert.equal(result.code, "DENY_ADMISSION_SOD", JSON.stringify(adm));
    }
    assert.equal(knowledgeLedger.read().length, 0, "no append on SoD denial");
    assert.equal(auditWriter.entries.length, 0, "no audit on SoD denial");
  });
});

// --- Stage 6: audit-first --------------------------------------------------

test("proposeClaim denies DENY_AUDIT_UNAVAILABLE when the audit writer throws, before any ledger append", () => {
  withHarness({ auditWriter: () => { throw new Error("audit down"); } }, ({ service, knowledgeLedger }) => {
    const result = service.proposeClaim(proposal());
    assert.equal(result.code, "DENY_AUDIT_UNAVAILABLE");
    assert.equal(knowledgeLedger.read().length, 0, "audit-first: no ledger mutation when audit is unavailable");
  });
});

test("audit-first spot-run: the audit entry is written strictly before the ledger append", () => {
  const order = [];
  const dir = mkdtempSync(join(tmpdir(), "secb-know-s1-order-"));
  try {
    const real = new KnowledgeLedger({
      filePath: join(dir, "knowledge.ndjson"),
      evidenceLookup: (ref) => LEDGER_EVIDENCE[ref] ?? null
    });
    const spyLedger = {
      appendClaim(...args) { order.push("append"); return real.appendClaim(...args); },
      resolveClaim: (...args) => real.resolveClaim(...args),
      read: () => real.read()
    };
    const service = createKnowledgeClaimService({
      knowledgeLedger: spyLedger,
      sodRules: kernelSodRules,
      evidenceResolver: makeEvidencePort(),
      now: () => FIXED_NOW,
      auditWriter: () => { order.push("audit"); }
    });
    const result = service.proposeClaim(proposal());
    assert.equal(result.decision, "ALLOW");
    assert.deepEqual(order, ["audit", "append"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Stage 7: learning-boundary passthrough (wrap-not-modify) --------------

test("PASSTHROUGH: the ledger's own DENY_EVIDENCE_CHAIN surfaces verbatim when evidence is not verified/accepted", () => {
  // The port DOUBLE resolves ev_captured_001 (ok:true), so the facade's
  // stage-4 resolvability check passes — proving the facade does NOT
  // pre-empt the learning boundary. The REAL ledger's own evidenceLookup
  // then reports CAPTURED and the ledger's own code denies.
  withHarness({}, ({ service, knowledgeLedger, auditWriter }) => {
    const result = service.proposeClaim(proposal({ claim: claim({ evidence_refs: ["ev_captured_001"] }) }));
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_EVIDENCE_CHAIN", "ledger's own code, not a facade re-code");
    assert.equal(result.reason, "Evidence is not verified/accepted: ev_captured_001 (CAPTURED)", "ledger's own message, verbatim");
    assert.equal(result.source, "knowledge-ledger");
    assert.equal(knowledgeLedger.read().length, 0);
    assert.equal(auditWriter.entries.length, 1, "audit precedes the delegated append; the denial happens inside the ledger");
  });
});

test("PASSTHROUGH: the ledger's identity-binding denial surfaces verbatim for a miswired envelope", () => {
  withHarness({}, ({ service }) => {
    const result = service.proposeClaim(proposal({ claim: claim({ evidence_refs: ["ev_miswired_001"] }) }));
    assert.equal(result.code, "DENY_EVIDENCE_CHAIN");
    assert.equal(result.reason, "Evidence lookup returned a mismatched envelope for: ev_miswired_001");
    assert.equal(result.source, "knowledge-ledger");
  });
});

test("PASSTHROUGH: the ledger's temporal-window denial surfaces verbatim (schema-valid but window-invalid)", () => {
  // valid_from >= valid_until passes the schema (both are date-times) — only
  // the ledger's own assertWindow denies. The facade must not pre-empt it.
  withHarness({}, ({ service }) => {
    const result = service.proposeClaim(
      proposal({ claim: claim({ valid_from: "2026-10-01T00:00:00Z", valid_until: "2026-07-19T10:00:00Z" }) })
    );
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_INVALID_TEMPORAL_WINDOW");
    assert.equal(result.source, "knowledge-ledger");
  });
});

test("PASSTHROUGH: the durable ledger's sequence conflict surfaces verbatim", () => {
  withHarness({}, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).decision, "ALLOW");
    const conflict = service.proposeClaim(
      proposal({ claim: claim({ claim_id: "kc_mod_know_s1_002" }), idempotencyKey: "idem_kc_2", expectedSequence: 0 })
    );
    assert.equal(conflict.decision, "DENY");
    assert.equal(conflict.code, "DENY_SEQUENCE_CONFLICT");
    assert.equal(conflict.source, "knowledge-ledger");
  });
});

test("proposeClaim denies DENY_LEDGER_UNAVAILABLE when the ledger throws without a code", () => {
  const brokenLedger = {
    appendClaim() { throw new Error("disk full"); },
    resolveClaim() {},
    read() { return []; }
  };
  withHarness({ ledger: brokenLedger }, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).code, "DENY_LEDGER_UNAVAILABLE");
  });
});

// --- getClaim (read-only) --------------------------------------------------

test("getClaim resolves an admitted claim at the trusted server instant, frozen and data_untrusted", () => {
  withHarness({}, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).decision, "ALLOW");
    const result = service.getClaim({ claim_id: "kc_mod_know_s1_001" });
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.code, "RESOLVED");
    assert.equal(result.resolved_at, FIXED_NOW.toISOString());
    assert.equal(result.data_untrusted, true);
    assert.equal(result.claim.claim_id, "kc_mod_know_s1_001");
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.claim));
  });
});

test("getClaim passes the ledger's temporal and unknown-claim denials through verbatim", () => {
  let clock = FIXED_NOW;
  withHarness({ now: () => clock }, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).decision, "ALLOW");
    assert.equal(service.getClaim({ claim_id: "kc_nope" }).code, "DENY_UNKNOWN_CLAIM");
    // Move the server clock past valid_until: deny-on-use, no decay.
    clock = new Date("2026-11-01T00:00:00Z");
    const expired = service.getClaim({ claim_id: "kc_mod_know_s1_001" });
    assert.equal(expired.decision, "DENY");
    assert.equal(expired.code, "DENY_TEMPORAL_BOUNDARY");
    assert.equal(expired.source, "knowledge-ledger");
  });
});

test("getClaim denies malformed queries and an unavailable clock", () => {
  withHarness({}, ({ service }) => {
    assert.equal(service.getClaim(null).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.getClaim({ claim_id: "x", rogue: 1 }).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.getClaim({ claim_id: " " }).code, "DENY_MISSING_FIELDS");
  });
  withHarness({ now: () => { throw new Error("no clock"); } }, ({ service }) => {
    assert.equal(service.getClaim({ claim_id: "x" }).code, "DENY_CLOCK_UNAVAILABLE");
  });
});

// --- listClaims (read-only) ------------------------------------------------

test("listClaims returns project-scoped claims, frozen and marked data_untrusted", () => {
  withHarness({}, ({ service }) => {
    assert.equal(service.proposeClaim(proposal()).decision, "ALLOW");
    assert.equal(
      service.proposeClaim(
        proposal({ claim: claim({ claim_id: "kc_other_proj", project_id: "proj-2" }), idempotencyKey: "idem_kc_2", expectedSequence: 1 })
      ).decision,
      "ALLOW"
    );
    const result = service.listClaims({ project_id: "proj-1" });
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.code, "LISTED");
    assert.equal(result.listed_at, FIXED_NOW.toISOString());
    assert.equal(result.claims.length, 1, "project scoping");
    assert.equal(result.claims[0].data_untrusted, true);
    assert.equal(result.claims[0].claim.claim_id, "kc_mod_know_s1_001");
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.claims));
    assert.ok(Object.isFrozen(result.claims[0]));
    assert.ok(Object.isFrozen(result.claims[0].claim));
  });
});

test("listClaims denies malformed queries and a throwing ledger read", () => {
  withHarness({}, ({ service }) => {
    assert.equal(service.listClaims(null).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.listClaims({ project_id: "p", rogue: 1 }).code, "DENY_MALFORMED_REQUEST");
    assert.equal(service.listClaims({ project_id: "" }).code, "DENY_MISSING_FIELDS");
  });
  const brokenLedger = { appendClaim() {}, resolveClaim() {}, read() { throw new Error("io"); } };
  withHarness({ ledger: brokenLedger }, ({ service }) => {
    assert.equal(service.listClaims({ project_id: "p" }).code, "DENY_LEDGER_UNAVAILABLE");
  });
});

// --- Wrap-not-modify guard -------------------------------------------------

test("GUARD: temporal-ledgers.mjs and sod-rules.mjs match the reviewed boundary digests", () => {
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  // Mechanism from main: compare against `git show main:<path>` rather than a
  // hardcoded digest, so the guard cannot go stale the way the old pins did.
  //
  // main also EXCLUDED src/control/sod-rules.mjs here, under
  // mod-gov-s1-sod-rules-hardening-fix-001. That exclusion is not inherited.
  // It authorizes main's own cross-cutting fix to the primitive; this branch
  // made a SEPARATE, still-unratified change to the same file at 9d4da11,
  // which deliberately left this guard red and queued it at f161746. Adopting
  // main's exclusion would silence the signal for our change while leaving
  // main's rationale attached to it — the branch would read as mergeable
  // precisely where it is not.
  //
  // temporal-ledgers.mjs is still compared live against main — it is untouched
  // by this branch and must stay that way.
  for (const path of ["src/ledger/temporal-ledgers.mjs"]) {
    const onMain = execFileSync("git", ["show", `main:${path}`], { cwd: REPO_ROOT, encoding: "utf8" });
    const onBranch = readFileSync(resolve(REPO_ROOT, path), "utf8");
    assert.equal(normalize(onBranch), normalize(onMain), `${path} must be untouched vs main (wrap-not-modify, R3+ hard line)`);
  }
  // sod-rules.mjs cannot be compared against main any more: both parents changed
  // it. main's own change is mod-gov-s1-sod-rules-hardening-fix-001; this
  // branch's is 9d4da11, which closed a self-approval bypass — actor ids were
  // compared as raw strings, so "alice\u200B" and "alice", and "\u0430lice"
  // (Cyrillic a) and "alice", read as two principals and let a producer approve
  // its own work. (Written as escapes on purpose, the same rule
  // sod-rules.mjs sets for itself.) 9d4da11 deliberately left this guard red and refused to
  // re-pin it: "it needs an owner who is neither of us." The operator ratified
  // it on 2026-08-08. Pinned to that ratified blob, so the guard still bites on
  // anything further.
  assert.equal(
    execFileSync("git", ["hash-object", resolve(REPO_ROOT, "src/control/sod-rules.mjs")], { cwd: REPO_ROOT, encoding: "utf8" }).trim(),
    "0cb83353ac1e8e9dd1c8d3bfd34a4a4d04fb389f",
    "sod-rules.mjs drifted from its operator-ratified blob"
  );
});
