import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ALLOW,
  buildDelegationDecisionRecord,
  DENY_HUMAN_APPROVAL_REQUIRED,
  evaluateDelegation,
  evaluateDelegationRequest
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
  const evaluation = evaluateDelegation(ceilingPair());
  const record = buildDelegationDecisionRecord(evaluation, identity());
  assert.equal(record.decision_type, "DISPOSITION");
  assert.equal(record.outcome, ALLOW);
  assert.ok(record.rationale.length > 0);
  assert.equal(record.decision_id, "dec_delegation_001");
  assert.equal(record.project_id, IDS.project);
});

test("buildDelegationDecisionRecord mints a DISPOSITION candidate whose outcome is the exact deny code", () => {
  const evaluation = evaluateDelegation(
    ceilingPair({ requestedCeiling: { riskClass: "R3" }, boundingCeiling: { riskClass: "R3" } })
  );
  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_002" }));
  assert.equal(record.decision_type, "DISPOSITION");
  assert.equal(record.outcome, DENY_HUMAN_APPROVAL_REQUIRED);
  assert.ok(record.rationale.includes("human approval"));
});

test("buildDelegationDecisionRecord performs no I/O — a candidate can be built without any ledger existing", () => {
  const evaluation = evaluateDelegation(ceilingPair());
  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_003" }));
  assert.equal(typeof record, "object");
});

// --- Real ledger recording: every disposition is genuinely appended -----

test("an allowed delegation disposition is genuinely appended to DecisionLedger and hash-chain verifies", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const evaluation = evaluateDelegation(ceilingPair());
  assert.deepEqual(evaluation, { ok: true, code: ALLOW });

  const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: "dec_delegation_allowed_001" }));
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
    const record = buildDelegationDecisionRecord(evaluation, identity({ decisionId: `dec_delegation_deny_${name}` }));
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
