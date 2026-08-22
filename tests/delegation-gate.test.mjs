import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ALLOW,
  buildDelegationDecisionRecord,
  DENY_DECISION_MISMATCH,
  DENY_HUMAN_APPROVAL_REQUIRED,
  DENY_UNKNOWN_DELEGATION_DECISION,
  DENY_WRONG_DECISION_TYPE,
  evaluateDelegation,
  evaluateDelegationRequest,
  verifyDelegationDecision
} from "../src/control/delegation-gate.mjs";
import { withinCeiling } from "../src/services/non-escalation-comparator.mjs";
import { riskProfile } from "../src/control/risk-registry.mjs";
import { DecisionLedger } from "../src/ledger/temporal-ledgers.mjs";

const IDS = Object.freeze({
  project: "prj_secb_local",
  workPackage: "wp_p0_moda2a_s2",
  session: "ses_moda2a_s2"
});

// A fully valid, non-escalating ceiling pair, so every test below
// overrides only the field(s) it wants to exercise (mirrors the
// `retryInput(overrides)` helper pattern in tests/retry-policy.test.mjs).
function ceilingPair(overrides = {}) {
  return {
    requestedCeiling: {
      riskClass: "R1",
      dataClassification: "INTERNAL",
      paths: ["src/control/sub"],
      tools: ["fs-read"],
      transitions: [],
      ...(overrides.requestedCeiling ?? {})
    },
    boundingCeiling: {
      riskClass: "R2",
      dataClassification: "CONFIDENTIAL",
      paths: ["src/control"],
      tools: ["fs-read", "fs-write"],
      transitions: ["DRAFT_TO_CANDIDATE"],
      ...(overrides.boundingCeiling ?? {})
    }
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-delegation-gate-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// --- Positive path: requested ceiling within delegator's own ceiling ----

test("evaluateDelegation allows a requested ceiling strictly within the delegator's own bounding ceiling", () => {
  assert.deepEqual(evaluateDelegation(ceilingPair()), { ok: true, code: ALLOW });
});

// --- Boundary: requested ceiling exactly equal to the bounding ceiling --

test("evaluateDelegation allows a requested ceiling exactly equal to the bounding ceiling (non-human-approval class)", () => {
  const equalCeiling = {
    riskClass: "R2",
    dataClassification: "CONFIDENTIAL",
    paths: ["src/control"],
    tools: ["fs-read", "fs-write"],
    transitions: ["DRAFT_TO_CANDIDATE"]
  };
  assert.deepEqual(
    evaluateDelegation({ requestedCeiling: { ...equalCeiling }, boundingCeiling: { ...equalCeiling } }),
    { ok: true, code: ALLOW }
  );
});

// --- Escalation: requested ceiling exceeds the delegator's own ceiling --

test("evaluateDelegation denies escalation on riskClass (requested > delegator's own bound)", () => {
  const result = evaluateDelegation(
    ceilingPair({ requestedCeiling: { riskClass: "R2" }, boundingCeiling: { riskClass: "R1" } })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION");
  assert.equal(result.dimension, "riskClass");
});

test("evaluateDelegation denies escalation on dataClassification (requested > delegator's own bound)", () => {
  const result = evaluateDelegation(
    ceilingPair({
      requestedCeiling: { riskClass: "R1", dataClassification: "RESTRICTED" },
      boundingCeiling: { riskClass: "R1", dataClassification: "INTERNAL" }
    })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION");
  assert.equal(result.dimension, "dataClassification");
});

test("evaluateDelegation denies escalation on paths (requested path outside the delegator's bound paths)", () => {
  const result = evaluateDelegation(
    ceilingPair({
      requestedCeiling: { paths: ["src/services"] },
      boundingCeiling: { paths: ["src/control"] }
    })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION");
  assert.equal(result.dimension, "paths");
});

test("evaluateDelegation denies escalation on tools (requested tool not in the delegator's own bound tools)", () => {
  const result = evaluateDelegation(
    ceilingPair({
      requestedCeiling: { tools: ["fs-write", "network"] },
      boundingCeiling: { tools: ["fs-write"] }
    })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION");
  assert.equal(result.dimension, "tools");
});

test("evaluateDelegation denies escalation on transitions (requested transition not in the delegator's own bound transitions)", () => {
  const result = evaluateDelegation(
    ceilingPair({
      requestedCeiling: { transitions: ["CANDIDATE_TO_MAIN"] },
      boundingCeiling: { transitions: ["DRAFT_TO_CANDIDATE"] }
    })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION");
  assert.equal(result.dimension, "transitions");
});

// --- Uncomparable: glob / '..' / unknown class, fail-closed -------------

test("evaluateDelegation denies uncomparable tools when either side carries a glob", () => {
  const result = evaluateDelegation(
    ceilingPair({ requestedCeiling: { tools: ["fs-*"] }, boundingCeiling: { tools: ["fs-*"] } })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION_UNCOMPARABLE");
  assert.equal(result.dimension, "tools");
});

test("evaluateDelegation denies uncomparable paths when either side carries '..'", () => {
  const result = evaluateDelegation(
    ceilingPair({ requestedCeiling: { paths: ["../etc"] } })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION_UNCOMPARABLE");
  assert.equal(result.dimension, "paths");
});

test("evaluateDelegation denies uncomparable riskClass when the class is not in the frozen order", () => {
  const result = evaluateDelegation(ceilingPair({ requestedCeiling: { riskClass: "R99" } }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_ESCALATION_UNCOMPARABLE");
  assert.equal(result.dimension, "riskClass");
});

test("evaluateDelegation denies a malformed/missing ceiling shape (no local reimplementation of shape validation)", () => {
  assert.deepEqual(evaluateDelegation(), {
    ok: false,
    code: "DENY_ESCALATION_UNCOMPARABLE",
    dimension: "shape"
  });
  assert.deepEqual(evaluateDelegation({}), {
    ok: false,
    code: "DENY_ESCALATION_UNCOMPARABLE",
    dimension: "shape"
  });
  assert.deepEqual(
    evaluateDelegation({ requestedCeiling: { riskClass: "R1" }, boundingCeiling: null }),
    { ok: false, code: "DENY_ESCALATION_UNCOMPARABLE", dimension: "shape" }
  );
});

// --- Human-approval invariant: gate never substitutes for a human gate --

test("evaluateDelegation denies with DENY_HUMAN_APPROVAL_REQUIRED for a within-bound R3 request (R3 requires human approval)", () => {
  const result = evaluateDelegation(
    ceilingPair({ requestedCeiling: { riskClass: "R3" }, boundingCeiling: { riskClass: "R3" } })
  );
  assert.deepEqual(result, { ok: false, code: DENY_HUMAN_APPROVAL_REQUIRED });
});

test("evaluateDelegation denies with DENY_HUMAN_APPROVAL_REQUIRED for a within-bound R4 request (R4 requires human approval)", () => {
  const result = evaluateDelegation(
    ceilingPair({ requestedCeiling: { riskClass: "R4" }, boundingCeiling: { riskClass: "R4" } })
  );
  assert.deepEqual(result, { ok: false, code: DENY_HUMAN_APPROVAL_REQUIRED });
});

test("evaluateDelegation allows within-bound R0/R1/R2 requests (none require human approval)", () => {
  for (const riskClass of ["R0", "R1", "R2"]) {
    assert.deepEqual(
      evaluateDelegation(ceilingPair({ requestedCeiling: { riskClass }, boundingCeiling: { riskClass } })),
      { ok: true, code: ALLOW },
      `riskClass ${riskClass} must not require human approval`
    );
  }
});

test("evaluateDelegation checks ceiling escalation before the human-approval gate (an escalating R3 request denies as escalation, not human-approval)", () => {
  // Requested R3 against a delegator bound of only R2: ceiling comparison
  // denies first — the human-approval short-circuit is never reached,
  // because the delegation never gets past step (a).
  const result = evaluateDelegation(
    ceilingPair({ requestedCeiling: { riskClass: "R3" }, boundingCeiling: { riskClass: "R2" } })
  );
  assert.equal(result.code, "DENY_ESCALATION");
});

// --- evaluateDelegationRequest: zero-logic S1-shape convenience wrapper -

test("evaluateDelegationRequest extracts .ceiling from an S1-shaped delegation request and forwards it unmodified", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/valid/delegation-request.json", import.meta.url)));
  // Fixture's ceiling: riskClass R2, dataClassification INTERNAL,
  // paths [src/ledger, contracts, tests], tools [fs-read, fs-write],
  // transitions [DRAFT_TO_CANDIDATE].
  const delegatorCeiling = {
    riskClass: "R2",
    dataClassification: "CONFIDENTIAL",
    paths: ["src/ledger", "contracts", "tests", "src/control"],
    tools: ["fs-read", "fs-write"],
    transitions: ["DRAFT_TO_CANDIDATE"]
  };
  const viaWrapper = evaluateDelegationRequest(fixture, delegatorCeiling);
  const viaDirect = evaluateDelegation({ requestedCeiling: fixture.ceiling, boundingCeiling: delegatorCeiling });
  assert.deepEqual(viaWrapper, viaDirect);
  assert.deepEqual(viaWrapper, { ok: true, code: ALLOW });
});

test("evaluateDelegationRequest denies fail-closed when the delegation request itself is missing/malformed", () => {
  assert.deepEqual(evaluateDelegationRequest(undefined, { riskClass: "R2", dataClassification: "INTERNAL", paths: [], tools: [], transitions: [] }), {
    ok: false,
    code: "DENY_ESCALATION_UNCOMPARABLE",
    dimension: "shape"
  });
  assert.deepEqual(evaluateDelegationRequest({}, { riskClass: "R2", dataClassification: "INTERNAL", paths: [], tools: [], transitions: [] }), {
    ok: false,
    code: "DENY_ESCALATION_UNCOMPARABLE",
    dimension: "shape"
  });
});

// --- Verbatim-reuse parity: no local reimplementation of comparator or --
// --- risk-registry logic (drift canary, mirrors                       --
// --- tests/sod-rules.test.mjs's config-equivalence pattern)            --

test("parity: evaluateDelegation's ceiling-level outcome is byte-identical to calling withinCeiling directly, across a matrix of cases", () => {
  const riskClasses = ["R0", "R1", "R2", "R3", "R4", "R99"];
  const dataClasses = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
  const pathSets = [["src/control"], ["src/control/sub"], ["src/services"], ["../etc"]];
  const toolSets = [["fs-read"], ["fs-read", "fs-write"], ["network"], ["fs-*"]];

  let scenarios = 0;
  for (const requestedRisk of riskClasses) {
    for (const requestedData of dataClasses) {
      for (const requestedPaths of pathSets) {
        for (const requestedTools of toolSets) {
          const requestedCeiling = {
            riskClass: requestedRisk,
            dataClassification: requestedData,
            paths: requestedPaths,
            tools: requestedTools,
            transitions: []
          };
          const boundingCeiling = {
            riskClass: "R2",
            dataClassification: "CONFIDENTIAL",
            paths: ["src/control"],
            tools: ["fs-read", "fs-write"],
            transitions: []
          };
          const gateResult = evaluateDelegation({ requestedCeiling, boundingCeiling });
          const referenceComparatorResult = withinCeiling(requestedCeiling, boundingCeiling);

          if (!referenceComparatorResult.ok) {
            // Whenever the reference comparator itself denies, the gate
            // must return that EXACT denial object — not a re-derived or
            // reworded one.
            assert.deepEqual(gateResult, referenceComparatorResult, `ceiling-denial parity for risk=${requestedRisk} data=${requestedData}`);
          } else {
            // Whenever the reference comparator allows, the gate's final
            // disposition must be exactly explained by risk-registry's
            // own humanApproval flag for the requested risk class — never
            // by any separate table this module might have invented.
            const referenceProfile = riskProfile(requestedRisk);
            assert.equal(referenceProfile.ok, true, `riskProfile must resolve for an already-ordered class ${requestedRisk}`);
            const expected = referenceProfile.value.humanApproval
              ? { ok: false, code: DENY_HUMAN_APPROVAL_REQUIRED }
              : { ok: true, code: ALLOW };
            assert.deepEqual(gateResult, expected, `human-approval parity for risk=${requestedRisk} data=${requestedData}`);
          }
          scenarios += 1;
        }
      }
    }
  }
  assert.equal(scenarios, riskClasses.length * dataClasses.length * pathSets.length * toolSets.length);
});

// --- Decision-record candidate construction ------------------------------

function identity(overrides = {}) {
  return {
    decisionId: "dec_delegation_001",
    version: 1,
    projectId: IDS.project,
    workPackageId: IDS.workPackage,
    sessionId: IDS.session,
    actorId: "claude-motor-moda2a-s2",
    authorityRef: "grant_producer_s2",
    evidenceRefs: ["ev_delegation_gate_001"],
    decidedAt: "2026-07-21T12:00:00Z",
    validFrom: "2026-07-21T12:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    ...overrides
  };
}

test("buildDelegationDecisionRecord mints a DISPOSITION candidate with outcome ALLOW on authorization", () => {
  const inputs = ceilingPair();
  const evaluation = evaluateDelegation(inputs);
  const record = buildDelegationDecisionRecord(evaluation, identity(), inputs);
  assert.equal(record.decision_type, "DISPOSITION");
  assert.equal(record.outcome, ALLOW);
  assert.ok(record.rationale.length > 0);
  assert.equal(record.decision_id, "dec_delegation_001");
  assert.equal(record.project_id, IDS.project);
});

test("buildDelegationDecisionRecord mints a DISPOSITION candidate whose outcome is the exact deny code", () => {
  const inputs = ceilingPair({ requestedCeiling: { riskClass: "R3" }, boundingCeiling: { riskClass: "R3" } });
  const evaluation = evaluateDelegation(inputs);
  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_002" }), inputs);
  assert.equal(record.decision_type, "DISPOSITION");
  assert.equal(record.outcome, DENY_HUMAN_APPROVAL_REQUIRED);
  assert.ok(record.rationale.includes("human approval"));
});

test("buildDelegationDecisionRecord performs no I/O — a candidate can be built without any ledger existing", () => {
  const inputs = ceilingPair();
  const evaluation = evaluateDelegation(inputs);
  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_003" }), inputs);
  assert.equal(typeof record, "object");
});

// --- Decision-record integrity binding (third-independent-review §4) ----
//
// Reproduces docs/03-project-control/candidates/
// mod-a2a-s2-non-escalation-gate-third-independent-review-001.md's exact
// finding: `buildDelegationDecisionRecord` previously trusted its
// `evaluation` argument at face value, with no trace of the actual
// ceilings evaluated, so a hand-fabricated `{ ok: true, code: "ALLOW" }`
// minted a schema-valid record byte-for-byte identical to a genuine one
// — even for a ceiling pair `evaluateDelegation` itself would deny as a
// real escalation attempt.

test("legitimate case: a record built from evaluateDelegation's real output for its real inputs verifies clean", () => {
  const inputs = ceilingPair();
  const evaluation = evaluateDelegation(inputs);
  assert.deepEqual(evaluation, { ok: true, code: ALLOW });
  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_bind_001" }), inputs);

  // Unchanged core fields (byte-for-byte, aside from the new binding
  // fingerprint now present in evidence_refs): still exactly as before.
  assert.equal(record.decision_type, "DISPOSITION");
  assert.equal(record.outcome, ALLOW);
  assert.equal(record.decision_id, "dec_delegation_bind_001");
  assert.equal(record.project_id, IDS.project);
  assert.ok(record.rationale.length > 0);

  // The caller-supplied evidenceRefs are preserved verbatim alongside the
  // new binding fingerprint (prepended), mirroring escalation-route.mjs.
  assert.ok(record.evidence_refs.includes("ev_delegation_gate_001"));
  assert.equal(record.evidence_refs.length, 2);

  assert.deepEqual(verifyDelegationDecision(record, inputs), { ok: true });
});

test("legitimate case: a genuine deny disposition also verifies clean", () => {
  const inputs = ceilingPair({ requestedCeiling: { riskClass: "R2" }, boundingCeiling: { riskClass: "R1" } });
  const evaluation = evaluateDelegation(inputs);
  assert.equal(evaluation.code, "DENY_ESCALATION");
  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_bind_002" }), inputs);
  assert.equal(record.outcome, "DENY_ESCALATION");
  assert.deepEqual(verifyDelegationDecision(record, inputs), { ok: true });
});

test("REGRESSION (third-independent-review §4): a hand-fabricated {ok:true, code:'ALLOW'} evaluation for a ceiling pair evaluateDelegation would actually deny is caught by verifyDelegationDecision, not silently trusted", () => {
  // Exact reviewer scenario: requested R4/RESTRICTED/broad paths+tools
  // against a narrow R0/PUBLIC/empty bounding ceiling — evaluateDelegation
  // itself denies this as DENY_ESCALATION.
  const hostileInputs = {
    requestedCeiling: { riskClass: "R4", dataClassification: "RESTRICTED", paths: ["/"], tools: ["*"], transitions: [] },
    boundingCeiling: { riskClass: "R0", dataClassification: "PUBLIC", paths: [], tools: [], transitions: [] }
  };
  const trueEvaluation = evaluateDelegation(hostileInputs);
  assert.equal(trueEvaluation.ok, false);
  assert.equal(trueEvaluation.code, "DENY_ESCALATION");

  // The attacker never calls evaluateDelegation — hand-fabricates it.
  const fabricatedEval = { ok: true, code: "ALLOW" };
  const forgedRecord = buildDelegationDecisionRecord(
    fabricatedEval,
    identity({ decisionId: "dec_delegation_forged_001" }),
    hostileInputs
  );

  // The record itself still reflects the caller's forged outcome (build
  // performs no re-decision — see module comment) ...
  assert.equal(forgedRecord.outcome, "ALLOW");

  // ... but a verifier who supplies the SAME actual ceilings recomputes
  // ground truth via evaluateDelegation and catches the mismatch: this is
  // exactly the audit-trail-forgery gap the third-independent-review
  // named, and it is now closed.
  assert.deepEqual(verifyDelegationDecision(forgedRecord, hostileInputs), {
    ok: false,
    code: DENY_DECISION_MISMATCH
  });
});

test("REGRESSION: a forged record cannot be laundered by pairing it with different (also-fabricated) ceilings at verify time", () => {
  // Even if a forger tries to re-present different ceilings alongside the
  // forged record at verification time (hoping some pair makes it stick),
  // the binding fingerprint embedded at mint time was computed over the
  // ORIGINAL hostile ceilings, so it will not match the fingerprint the
  // verifier recomputes from a different set of "innocent-looking" ones.
  const hostileInputs = {
    requestedCeiling: { riskClass: "R4", dataClassification: "RESTRICTED", paths: ["/"], tools: ["*"], transitions: [] },
    boundingCeiling: { riskClass: "R0", dataClassification: "PUBLIC", paths: [], tools: [], transitions: [] }
  };
  const forgedRecord = buildDelegationDecisionRecord(
    { ok: true, code: "ALLOW" },
    identity({ decisionId: "dec_delegation_forged_002" }),
    hostileInputs
  );
  const innocentInputs = ceilingPair();
  assert.deepEqual(verifyDelegationDecision(forgedRecord, innocentInputs), {
    ok: false,
    code: DENY_DECISION_MISMATCH
  });
});

test("verifyDelegationDecision denies fail-closed on a null/non-object decision", () => {
  assert.deepEqual(verifyDelegationDecision(null, ceilingPair()), { ok: false, code: DENY_UNKNOWN_DELEGATION_DECISION });
  assert.deepEqual(verifyDelegationDecision(undefined, ceilingPair()), { ok: false, code: DENY_UNKNOWN_DELEGATION_DECISION });
});

test("verifyDelegationDecision denies fail-closed on the wrong decision_type", () => {
  const inputs = ceilingPair();
  const record = buildDelegationDecisionRecord(evaluateDelegation(inputs), identity(), inputs);
  const wrongType = { ...record, decision_type: "GOVERNANCE" };
  assert.deepEqual(verifyDelegationDecision(wrongType, inputs), { ok: false, code: DENY_WRONG_DECISION_TYPE });
});

test("verifyDelegationDecision denies when evidence_refs is missing or tampered", () => {
  const inputs = ceilingPair();
  const record = buildDelegationDecisionRecord(evaluateDelegation(inputs), identity(), inputs);
  const strippedRefs = { ...record, evidence_refs: ["ev_delegation_gate_001"] };
  assert.deepEqual(verifyDelegationDecision(strippedRefs, inputs), { ok: false, code: DENY_DECISION_MISMATCH });
  const noRefs = { ...record, evidence_refs: undefined };
  assert.deepEqual(verifyDelegationDecision(noRefs, inputs), { ok: false, code: DENY_DECISION_MISMATCH });
});

// --- Real ledger recording: every disposition is genuinely appended -----

test("an allowed delegation disposition is genuinely appended to DecisionLedger and hash-chain verifies", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const inputs = ceilingPair();
  const evaluation = evaluateDelegation(inputs);
  assert.deepEqual(evaluation, { ok: true, code: ALLOW });

  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_allowed_001" }), inputs);
  const appended = ledger.appendDecision(record, { expectedSequence: 0, idempotencyKey: "idem_delegation_allowed_001" });
  assert.equal(appended.sequence, 1);

  // Not just a return value: reopen the ledger from disk and confirm the
  // disposition is really there, hash-chain-verified.
  const reopened = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const persisted = reopened.read();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].entry.payload.outcome, "ALLOW");
  assert.equal(persisted[0].entry.payload.decision_type, "DISPOSITION");
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-decision-ledger",
    count: 1,
    headHash: appended.recordHash
  });

  const resolved = reopened.resolveEffective("dec_delegation_allowed_001", { at: "2026-08-01T00:00:00Z" });
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.decision.outcome, "ALLOW");
}));

test("every denial disposition in the matrix is genuinely appended to DecisionLedger, not just returned", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });

  const denialCases = [
    {
      name: "escalation",
      input: ceilingPair({ requestedCeiling: { riskClass: "R2" }, boundingCeiling: { riskClass: "R1" } })
    },
    {
      name: "uncomparable",
      input: ceilingPair({ requestedCeiling: { tools: ["fs-*"] } })
    },
    {
      name: "human_approval",
      input: ceilingPair({ requestedCeiling: { riskClass: "R3" }, boundingCeiling: { riskClass: "R3" } })
    }
  ];

  let expectedSequence = 0;
  for (const { name, input } of denialCases) {
    const evaluation = evaluateDelegation(input);
    assert.equal(evaluation.ok, false);
    const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: `dec_delegation_deny_${name}` }), input);
    const appended = ledger.appendDecision(record, { expectedSequence, idempotencyKey: `idem_delegation_deny_${name}` });
    expectedSequence = appended.sequence;
  }

  const reopened = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const persisted = reopened.read();
  assert.equal(persisted.length, denialCases.length);
  assert.deepEqual(
    persisted.map((record) => record.entry.payload.outcome),
    ["DENY_ESCALATION", "DENY_ESCALATION_UNCOMPARABLE", DENY_HUMAN_APPROVAL_REQUIRED]
  );
  for (const record of persisted) {
    assert.equal(record.entry.payload.decision_type, "DISPOSITION");
  }
  assert.equal(reopened.verify().valid, true);
}));

test("a malformed-input candidate that omits identity fields is denied by the ledger's own contract validation, not silently accepted", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const evaluation = evaluateDelegation(ceilingPair());
  // Deliberately build a candidate missing required identity fields — this
  // module must not duplicate DecisionLedger's own fail-closed contract
  // gate, and that gate must still catch it.
  const incompleteRecord = buildDelegationDecisionRecord(evaluation, { decisionId: "dec_delegation_incomplete" });
  assert.throws(
    () => ledger.appendDecision(incompleteRecord, { expectedSequence: 0, idempotencyKey: "idem_incomplete" }),
    (error) => error.code === "DENY_CONTRACT_INVALID"
  );
}));
