import assert from "node:assert/strict";
import test from "node:test";
import { ContractValidationError } from "../src/contracts/contract-validator.mjs";
import { REQUIRED_ROLE } from "../src/control/authority-engine.mjs";
import { STATE_MACHINES, TransitionDeniedError } from "../src/control/state-machine.mjs";
import {
  EFFECTIVE_STATES,
  WORK_PACKAGE_SERVICE_ROLE_GATES,
  WorkPackageContractService,
  WorkPackageServiceError
} from "../src/services/work-package-service.mjs";

const PROJECT = "prj_secb_local";
const WP = "wp_p0_09_demo";
const BASELINE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const ENGIN = "engin-actor";
const REV = "rev-actor";
const QA_ACTOR = "qa-actor";
const GOV = "gov-actor";
const DUAL = "dual-engin-qa-actor";

function versionedRef(reference, version) {
  return version === 1 ? reference : `${reference}_v${version}`;
}

function grantsForVersion(version) {
  const window = {
    projectId: PROJECT,
    workPackageId: WP,
    workPackageVersion: version,
    validFrom: "2026-07-01T00:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    status: "ACTIVE"
  };
  return [
    {
      ...window,
      grantId: versionedRef("grant_engin", version),
      decisionId: versionedRef("decision_engin", version),
      actorId: ENGIN,
      roles: ["ENGIN"],
      allowedTransitions: [
        "WorkPackage:DRAFT->PLANNED",
        "WorkPackage:REWORK->PLANNED",
        "WorkPackage:BLOCKED->PLANNED",
        "WorkPackage:AUTHORIZED->READY",
        "WorkPackage:READY->RUNNING",
        "WorkPackage:RUNNING->SELF_VERIFIED"
      ]
    },
    {
      ...window,
      grantId: versionedRef("grant_rev", version),
      decisionId: versionedRef("decision_rev", version),
      actorId: REV,
      roles: ["REV"],
      allowedTransitions: [
        "WorkPackage:PLANNED->REVIEWED",
        "WorkPackage:SELF_VERIFIED->REVIEW",
        "WorkPackage:REVIEW->REWORK"
      ]
    },
    {
      ...window,
      grantId: versionedRef("grant_qa", version),
      decisionId: versionedRef("decision_qa", version),
      actorId: QA_ACTOR,
      roles: ["QA"],
      allowedTransitions: ["WorkPackage:REVIEW->QA", "WorkPackage:QA->BLOCKED"]
    },
    {
      ...window,
      grantId: versionedRef("grant_gov", version),
      decisionId: versionedRef("decision_gov", version),
      actorId: GOV,
      roles: ["GOV"],
      allowedTransitions: [
        "WorkPackage:REVIEWED->AUTHORIZED",
        "WorkPackage:QA->GOV_DECISION",
        "WorkPackage:GOV_DECISION->ACCEPTED",
        "WorkPackage:GOV_DECISION->REWORK",
        "WorkPackage:AUTHORIZED->REVOKED",
        "WorkPackage:AUTHORIZED->CANCELLED"
      ]
    },
    {
      // ENGIN+QA is not a conflicting role pair at grant level; the
      // service's ledger-derived SoD must still stop this actor from
      // QA-ing its own execution.
      ...window,
      grantId: versionedRef("grant_dual", version),
      decisionId: versionedRef("decision_dual", version),
      actorId: DUAL,
      roles: ["ENGIN", "QA"],
      allowedTransitions: [
        "WorkPackage:READY->RUNNING",
        "WorkPackage:RUNNING->SELF_VERIFIED",
        "WorkPackage:REVIEW->QA"
      ]
    }
  ];
}

function grants() {
  return [...grantsForVersion(1), ...grantsForVersion(2)];
}

function draft(overrides = {}) {
  return {
    work_package_id: WP,
    version: 1,
    project_id: PROJECT,
    objective: "Deliver work package authorization and acceptance contracts",
    risk_class: "R2",
    status: "DRAFT",
    baseline: BASELINE,
    scope: ["src/services/", "tests/"],
    non_scope: ["production activation"],
    acceptance_criteria: ["negative matrix fails closed", "npm test passes"],
    roles: { producer: ENGIN, reviewer: REV, qa: QA_ACTOR, gov: GOV },
    allowed_paths: ["C:/laragon/www/SecB"],
    prohibited_paths: ["outside:C:/laragon/www/SecB"],
    evidence_obligations: ["self:unit-tests", "review-report", "qa-report"],
    valid_until: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

function harness({ start = "2026-07-18T10:00:00Z", grantSet = grants(), authoritySource, omitAuthoritySource = false, clock } = {}) {
  let nowMs = Date.parse(start);
  let seq = 0;
  const serviceOptions = { grants: grantSet, now: clock ?? (() => new Date(nowMs)) };
  if (!omitAuthoritySource) serviceOptions.authoritySource = authoritySource ?? (() => grantSet);
  const service = new WorkPackageContractService(serviceOptions);
  const key = () => `idem_${++seq}`;
  const setNow = (iso) => { nowMs = Date.parse(iso); };
  const create = (overrides = {}, idempotencyKey = key(), authority = {}) => {
    const candidate = draft(overrides);
    return service.createWorkPackage(candidate, {
      idempotencyKey,
      actorId: ENGIN,
      authorityRef: versionedRef("grant_engin", candidate.version),
      ...authority
    });
  };
  const send = (overrides) => service.submitTransition({
    projectId: PROJECT,
    workPackageId: WP,
    version: 1,
    requestedState: "PLANNED",
    actorId: ENGIN,
    authorityRef: "grant_engin",
    policyDecision: "ALLOW",
    evidence: [{ ref: `ev_step_${seq + 1}` }],
    idempotencyKey: key(),
    reasonCode: "STEP",
    ...overrides
  });
  return { service, create, send, key, setNow };
}

const HAPPY_PATH = [
  ["PLANNED", ENGIN, "grant_engin", null],
  ["REVIEWED", REV, "grant_rev", null],
  ["AUTHORIZED", GOV, "grant_gov", null],
  ["READY", ENGIN, "grant_engin", null],
  ["RUNNING", ENGIN, "grant_engin", null],
  ["SELF_VERIFIED", ENGIN, "grant_engin", "self:unit-tests"],
  ["REVIEW", REV, "grant_rev", "review-report"],
  ["QA", QA_ACTOR, "grant_qa", "qa-report"],
  ["GOV_DECISION", GOV, "grant_gov", null],
  ["ACCEPTED", GOV, "grant_gov", null]
];

function advanceTo(h, target, { version = 1 } = {}) {
  let last = null;
  for (const [state, actorId, authorityRef, obligation] of HAPPY_PATH) {
    last = h.send({
      requestedState: state,
      actorId,
      authorityRef: versionedRef(authorityRef, version),
      version,
      evidence: [obligation ? { ref: `ev_${state}_v${version}`, obligation } : { ref: `ev_${state}_v${version}` }]
    });
    if (state === target) return last;
  }
  return last;
}

function denies(fn, code, ErrorClass = WorkPackageServiceError) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ErrorClass, `expected ${ErrorClass.name}, got ${error.name}: ${error.message}`);
    assert.equal(error.code, code);
    return true;
  });
}

// --- positive path ---

test("full lifecycle reaches ACCEPTED with independent actors and server timestamps", () => {
  const h = harness();
  const created = h.create();
  assert.equal(created.state, "DRAFT");
  assert.equal(created.revision, 1);
  assert.match(created.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(created.createdAt, "2026-07-18T10:00:00.000Z");

  const accepted = advanceTo(h, "ACCEPTED");
  assert.equal(accepted.state, "ACCEPTED");
  assert.equal(accepted.previousState, "GOV_DECISION");
  assert.equal(accepted.revision, 11);
  assert.equal(accepted.authorityDecisionId, "decision_gov");
  assert.equal(accepted.timestamp, "2026-07-18T10:00:00.000Z");

  const stored = h.service.getWorkPackage(PROJECT, WP);
  assert.equal(stored.state, "ACCEPTED");
});

test("caller-supplied timestamps are recorded as claims but never trusted", () => {
  const h = harness();
  h.create();
  const result = h.send({ claimedTimestamp: "2020-01-01T00:00:00Z" });
  assert.equal(result.timestamp, "2026-07-18T10:00:00.000Z");
  const ledger = h.service.getDecisionLedger(PROJECT, WP);
  assert.equal(ledger.at(-1).claimedTimestamp, "2020-01-01T00:00:00Z");
  assert.equal(ledger.at(-1).timestamp, "2026-07-18T10:00:00.000Z");
});

test("one authoritative instant governs creation authorization and its recorded timestamp", () => {
  const instants = [new Date("2026-07-18T10:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z")];
  let calls = 0;
  const grantSet = grants();
  const service = new WorkPackageContractService({
    grants: grantSet,
    authoritySource: () => grantSet,
    now: () => instants[Math.min(calls++, instants.length - 1)]
  });
  const created = service.createWorkPackage(draft(), {
    idempotencyKey: "idem_single_create_time", actorId: ENGIN, authorityRef: "grant_engin"
  });
  assert.equal(calls, 1);
  assert.equal(created.createdAt, "2026-07-18T10:00:00.000Z");
});

test("one authoritative instant governs transition authorization, expiry, and recording", () => {
  let phase = "create";
  let calls = 0;
  const grantSet = grants().map((grant) => ({ ...grant, validUntil: "2026-07-18T10:00:00.500Z" }));
  const service = new WorkPackageContractService({
    grants: grantSet,
    authoritySource: () => grantSet,
    now: () => {
      calls += 1;
      if (phase === "create") return new Date("2026-07-18T09:59:59.000Z");
      return calls === 1 ? new Date("2026-07-18T10:00:00.499Z") : new Date("2026-07-18T10:00:00.501Z");
    }
  });
  service.createWorkPackage(draft(), {
    idempotencyKey: "idem_split_create", actorId: ENGIN, authorityRef: "grant_engin"
  });
  phase = "transition";
  calls = 0;
  const result = service.submitTransition({
    projectId: PROJECT, workPackageId: WP, version: 1, requestedState: "PLANNED",
    actorId: ENGIN, authorityRef: "grant_engin", policyDecision: "ALLOW",
    evidence: [{ ref: "ev_single_transition_time" }], idempotencyKey: "idem_single_transition_time",
    reasonCode: "CLOCK_REGRESSION"
  });
  assert.equal(calls, 1);
  assert.equal(result.timestamp, "2026-07-18T10:00:00.499Z");
});

test("grant windows are validFrom-inclusive and validUntil-exclusive", () => {
  const validFrom = "2026-07-18T10:00:00.000Z";
  const validUntil = "2026-07-18T10:01:00.000Z";
  const grantSet = grants().map((grant) => ({ ...grant, validFrom, validUntil }));
  const h = harness({ start: validFrom, grantSet });
  h.create();
  assert.equal(h.send({ requestedState: "PLANNED" }).state, "PLANNED");
  const exclusive = harness({ start: validFrom, grantSet });
  exclusive.create();
  exclusive.setNow(validUntil);
  denies(() => exclusive.send({ requestedState: "PLANNED" }), "DENY_AUTHORITY", TransitionDeniedError);
});

test("invalid, wrong-type, and throwing clocks fail with a controlled code", () => {
  class PoisonedDate extends Date { getTime() { throw new Error("poisoned getTime"); } }
  for (const [label, clock] of [
    ["invalid Date", () => new Date(Number.NaN)],
    ["positive infinity", () => new Date(Number.POSITIVE_INFINITY)],
    ["negative infinity", () => new Date(Number.NEGATIVE_INFINITY)],
    ["wrong type", () => "2026-07-18T10:00:00.000Z"],
    ["Date-shaped throwing getTime", () => ({ getTime() { throw new Error("date-shaped poison"); } })],
    ["poisoned Date getTime", () => new PoisonedDate("2026-07-18T10:00:00.000Z")],
    ["throwing", () => { throw new Error("clock unavailable"); }]
  ]) {
    const grantSet = grants();
    const service = new WorkPackageContractService({ grants: grantSet, authoritySource: () => grantSet, now: clock });
    denies(() => service.createWorkPackage(draft(), {
      idempotencyKey: `idem_bad_clock_${label}`, actorId: ENGIN, authorityRef: "grant_engin"
    }), "DENY_AUTHORITY_TIME");
  }
});

test("poisoned Date getTime is contained during transition and effective resolution", () => {
  class PoisonedDate extends Date { getTime() { throw new Error("poisoned getTime"); } }
  let currentTime = new Date("2026-07-18T10:00:00.000Z");
  const h = harness({ clock: () => currentTime });
  h.create();
  currentTime = new PoisonedDate("2026-07-18T10:00:00.000Z");
  denies(() => h.send({ requestedState: "PLANNED" }), "DENY_AUTHORITY_TIME");
  currentTime = new Date("2026-07-18T10:00:00.000Z");
  advanceTo(h, "AUTHORIZED");
  currentTime = new PoisonedDate("2026-07-18T10:00:00.000Z");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "DENY_AUTHORITY_TIME");
});

test("finite out-of-range decision times are denied across create, transition, and resolution", () => {
  class OutOfRangeDate extends Date { getTime() { return 9e15; } }
  const grantSet = grants();
  for (const value of [9e15, -9e15]) {
    class SignedOutOfRangeDate extends Date { getTime() { return value; } }
    const createService = new WorkPackageContractService({
      grants: grantSet, authoritySource: () => grantSet,
      now: () => new SignedOutOfRangeDate("2026-07-18T10:00:00.000Z")
    });
    denies(() => createService.createWorkPackage(draft(), {
      idempotencyKey: `idem_out_of_range_create_${value}`, actorId: ENGIN, authorityRef: "grant_engin"
    }), "DENY_AUTHORITY_TIME");
  }
  let currentTime = new Date("2026-07-18T10:00:00.000Z");
  const h = harness({ clock: () => currentTime });
  h.create();
  currentTime = new OutOfRangeDate("2026-07-18T10:00:00.000Z");
  denies(() => h.send({ requestedState: "PLANNED" }), "DENY_AUTHORITY_TIME");
  currentTime = new Date("2026-07-18T10:00:00.000Z");
  advanceTo(h, "AUTHORIZED");
  currentTime = new OutOfRangeDate("2026-07-18T10:00:00.000Z");
  const resolved = h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE });
  assert.equal(resolved.effective, null);
  assert.equal(resolved.code, "DENY_AUTHORITY_TIME");
});

test("stateful valid-first-then-throw Date extraction is contained", () => {
  const grantSet = grants();
  const service = new WorkPackageContractService({
    grants: grantSet, authoritySource: () => grantSet, now: () => new Date("2026-07-18T10:00:00.000Z")
  });
  const nativeGetTime = Date.prototype.getTime;
  let calls = 0;
  Date.prototype.getTime = function statefulGetTime() {
    calls += 1;
    if (calls === 1) return nativeGetTime.call(this);
    throw new Error("stateful getTime poison");
  };
  try {
    denies(() => service.createWorkPackage(draft(), {
      idempotencyKey: "idem_stateful_clock", actorId: ENGIN, authorityRef: "grant_engin"
    }), "DENY_AUTHORITY_TIME");
  } finally {
    Date.prototype.getTime = nativeGetTime;
  }
});

test("transition and effective resolution reject a clock that becomes invalid", () => {
  let currentTime = new Date("2026-07-18T10:00:00.000Z");
  const grantSet = grants();
  const h = harness({ authoritySource: () => grantSet, grantSet });
  const service = new WorkPackageContractService({ grants: grantSet, authoritySource: () => grantSet, now: () => currentTime });
  service.createWorkPackage(draft(), {
    idempotencyKey: "idem_clock_mutation_create", actorId: ENGIN, authorityRef: "grant_engin"
  });
  currentTime = new Date(Number.NaN);
  denies(() => service.submitTransition({
    projectId: PROJECT, workPackageId: WP, version: 1, requestedState: "PLANNED",
    actorId: ENGIN, authorityRef: "grant_engin", policyDecision: "ALLOW",
    evidence: [{ ref: "ev_bad_transition_clock" }], idempotencyKey: "idem_bad_transition_clock",
    reasonCode: "CLOCK_INVALID"
  }), "DENY_AUTHORITY_TIME");
  h.create();
  advanceTo(h, "AUTHORIZED");
  h.setNow("invalid-date");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "DENY_AUTHORITY_TIME");
});

test("decision ledger is append-only and starts with the CREATE entry", () => {
  const h = harness();
  h.create();
  advanceTo(h, "REVIEWED");
  const ledger = h.service.getDecisionLedger(PROJECT, WP);
  assert.equal(ledger.length, 3);
  assert.equal(ledger[0].type, "CREATE");
  assert.deepEqual(ledger.map((entry) => entry.seq), [1, 2, 3]);
  assert.deepEqual(ledger.slice(1).map((entry) => entry.state), ["PLANNED", "REVIEWED"]);
});

test("returned records are deep-frozen and detached from the store", () => {
  const h = harness();
  const created = h.create();
  assert.throws(() => { created.state = "ACCEPTED"; }, TypeError);
  const view = h.service.getWorkPackage(PROJECT, WP, 1);
  assert.throws(() => { view.contract.scope.push("everything/"); }, TypeError);
  assert.equal(h.service.getWorkPackage(PROJECT, WP, 1).contract.scope.length, 2);
});

// --- idempotency and replay ---

test("identical create replays stably; identical transition replays without double-advancing", () => {
  const h = harness();
  const first = h.create({}, "idem_create_fixed");
  const replay = h.create({}, "idem_create_fixed");
  assert.equal(replay.replayed, true);
  assert.equal(replay.fingerprint, first.fingerprint);

  const envelope = {
    projectId: PROJECT,
    workPackageId: WP,
    version: 1,
    requestedState: "PLANNED",
    actorId: ENGIN,
    authorityRef: "grant_engin",
    policyDecision: "ALLOW",
    evidence: [{ ref: "ev_plan" }],
    idempotencyKey: "idem_plan_fixed",
    reasonCode: "STEP"
  };
  const applied = h.service.submitTransition(envelope);
  const replayed = h.service.submitTransition(structuredClone(envelope));
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.transitionId, applied.transitionId);
  assert.equal(h.service.getWorkPackage(PROJECT, WP).state, "PLANNED");
  assert.equal(h.service.getWorkPackage(PROJECT, WP).revision, 2);
});

test("non-string idempotency keys and key reuse across different envelopes are denied", () => {
  const h = harness();
  denies(() => h.create({}, 42), "DENY_IDEMPOTENCY_KEY");
  h.create({}, "idem_dup");
  denies(() => h.create({ objective: "different draft" }, "idem_dup"), "DENY_IDEMPOTENCY_CONFLICT");
});

// --- creation hardening ---

test("creation enforces the closed schema", () => {
  const h = harness();
  denies(() => h.create({ objective: undefined }), "DENY_CONTRACT_INVALID", ContractValidationError);
  denies(() => h.create({ extra_field: "nope" }), "DENY_CONTRACT_INVALID", ContractValidationError);
});

test("creation refuses non-DRAFT status, blank scalars, and duplicate identity", () => {
  const h = harness();
  denies(() => h.create({ status: "AUTHORIZED" }), "DENY_NOT_DRAFT");
  denies(() => h.create({ objective: "   " }), "DENY_BLANK_SCALAR");
  denies(() => h.create({ scope: ["src/", "  "] }), "DENY_BLANK_SCALAR");
  h.create();
  denies(() => h.create(), "DENY_DUPLICATE_IDENTITY");
});

test("creation requires an active, correctly scoped ENGIN or GOV grant", () => {
  const h = harness();
  denies(() => h.service.createWorkPackage(draft(), { idempotencyKey: "idem_nogate" }), "DENY_MALFORMED_DRAFT");
  denies(() => h.create({}, "idem_rev_gate", { actorId: REV, authorityRef: "grant_rev" }), "DENY_CREATE_AUTHORITY");
  denies(() => h.create({}, "idem_borrowed", { actorId: REV, authorityRef: "grant_engin" }), "DENY_CREATE_AUTHORITY");
  denies(() => h.create({ work_package_id: "wp_out_of_scope" }, "idem_scope"), "DENY_CREATE_AUTHORITY");
  const created = h.create();
  assert.equal(created.state, "DRAFT");
  const ledger = h.service.getDecisionLedger(PROJECT, WP);
  assert.equal(ledger[0].actorId, ENGIN);
  assert.equal(ledger[0].authorityDecisionId, "decision_engin");
});

test("REWORK opens a new evidence cycle: stale obligations no longer satisfy GOV_DECISION", () => {
  const h = harness();
  h.create();
  advanceTo(h, "GOV_DECISION");
  h.send({ requestedState: "REWORK", actorId: GOV, authorityRef: "grant_gov" });
  h.send({ requestedState: "PLANNED", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "REVIEWED", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "AUTHORIZED", actorId: GOV, authorityRef: "grant_gov" });
  h.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "RUNNING", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "SELF_VERIFIED", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "QA", actorId: QA_ACTOR, authorityRef: "grant_qa" });
  // all obligations were evidenced in cycle 0; none re-evidenced in cycle 1
  denies(
    () => h.send({ requestedState: "GOV_DECISION", actorId: GOV, authorityRef: "grant_gov" }),
    "DENY_EVIDENCE_INSUFFICIENT"
  );
});

test("a BLOCKED re-planning loop also opens a new evidence cycle", () => {
  const h = harness();
  h.create();
  advanceTo(h, "QA");
  h.send({ requestedState: "BLOCKED", actorId: QA_ACTOR, authorityRef: "grant_qa" });
  h.send({ requestedState: "PLANNED", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "REVIEWED", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "AUTHORIZED", actorId: GOV, authorityRef: "grant_gov" });
  h.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "RUNNING", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "SELF_VERIFIED", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "QA", actorId: QA_ACTOR, authorityRef: "grant_qa" });
  denies(
    () => h.send({ requestedState: "GOV_DECISION", actorId: GOV, authorityRef: "grant_gov" }),
    "DENY_EVIDENCE_INSUFFICIENT"
  );
});

test("a rework cycle that re-evidences its obligations reaches ACCEPTED", () => {
  const h = harness();
  h.create();
  advanceTo(h, "GOV_DECISION");
  h.send({ requestedState: "REWORK", actorId: GOV, authorityRef: "grant_gov" });
  const accepted = advanceTo(h, "ACCEPTED");
  assert.equal(accepted.state, "ACCEPTED");
});

test("ids containing the composite-key delimiter are denied at both gates", () => {
  const h = harness();
  // Immune finding: (prj, "alpha|wp1") and ("prj|alpha", wp1) collided into
  // one storage key, letting a grant for one identity act on the other.
  denies(() => h.create({ work_package_id: "alpha|wp1" }), "DENY_ID_CHARSET");
  denies(() => h.create({ project_id: "prj|alpha" }), "DENY_ID_CHARSET");
  // '@' collides TransitionEngine objectIds: ("wp@v1", v1) vs ("wp", ...)
  denies(() => h.create({ work_package_id: "wp@v1" }), "DENY_ID_CHARSET");
  denies(() => h.create({ project_id: "prj@x" }), "DENY_ID_CHARSET");
  h.create();
  denies(() => h.send({ workPackageId: "alpha|wp1" }), "DENY_MALFORMED_ENVELOPE");
  denies(() => h.send({ projectId: "prj|alpha" }), "DENY_MALFORMED_ENVELOPE");
  denies(() => h.send({ workPackageId: "wp@v1" }), "DENY_MALFORMED_ENVELOPE");
  // GOV-P011-08 shared-engine tightening: reserved delimiters in grant
  // fields are refused at AuthorityEngine construction
  assert.throws(
    () => new WorkPackageContractService({
      grants: [{ ...grants()[0], grantId: "g|bad", actorId: ENGIN }],
      now: () => new Date("2026-07-18T10:00:00Z")
    }),
    (error) => error.name === "AuthorityConfigurationError" && error.code === "INVALID_GRANT"
  );
  denies(() => h.send({ claimedTimestamp: 12345 }), "DENY_MALFORMED_ENVELOPE");
});

// --- transition hardening ---

test("unknown work package, unknown state, and closed-envelope violations are denied", () => {
  const h = harness();
  denies(() => h.send({ workPackageId: "wp_ghost" }), "DENY_UNKNOWN_WORK_PACKAGE");
  h.create();
  denies(() => h.send({ requestedState: "SHIPPED" }), "DENY_UNKNOWN_STATE");
  denies(() => h.send({ smuggled: true }), "DENY_MALFORMED_ENVELOPE");
  denies(() => h.send({ actorId: "  " }), "DENY_MALFORMED_ENVELOPE");
  denies(() => h.send({ evidence: [] }), "DENY_MALFORMED_ENVELOPE");
  denies(() => h.send({ evidence: [{ ref: "" }] }), "DENY_MALFORMED_ENVELOPE");
  denies(() => h.send({ version: 0 }), "DENY_MALFORMED_ENVELOPE");
});

test("illegal edges are denied, including everything out of a terminal state", () => {
  const h = harness();
  h.create();
  denies(() => h.send({ requestedState: "RUNNING" }), "DENY_UNDEFINED_TRANSITION");
  denies(() => h.send({ requestedState: "ACCEPTED", actorId: GOV, authorityRef: "grant_gov" }), "DENY_UNDEFINED_TRANSITION");
  advanceTo(h, "ACCEPTED");
  denies(() => h.send({ requestedState: "REWORK", actorId: GOV, authorityRef: "grant_gov" }), "DENY_UNDEFINED_TRANSITION");
});

test("policy decisions other than ALLOW fail closed", () => {
  const h = harness();
  h.create();
  denies(() => h.send({ policyDecision: "DENY" }), "DENY_POLICY", TransitionDeniedError);
});

test("wrong role, borrowed grant, and out-of-window grant are denied by authority", () => {
  const h = harness();
  // contract outlives the grant window so the grant is the binding constraint
  h.create({ valid_until: "2027-06-01T00:00:00Z" });
  advanceTo(h, "SELF_VERIFIED");
  // the executor is stopped by the service SoD gate before authority runs
  denies(() => h.send({ requestedState: "REVIEW", actorId: ENGIN, authorityRef: "grant_engin" }), "DENY_SOD");
  // a non-executor with the wrong role, and one borrowing another actor's grant
  denies(
    () => h.send({ requestedState: "REVIEW", actorId: QA_ACTOR, authorityRef: "grant_qa" }),
    "DENY_AUTHORITY",
    TransitionDeniedError
  );
  denies(
    () => h.send({ requestedState: "REVIEW", actorId: QA_ACTOR, authorityRef: "grant_rev" }),
    "DENY_AUTHORITY",
    TransitionDeniedError
  );
  h.setNow("2027-01-01T00:00:00Z");
  denies(
    () => h.send({ requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev" }),
    "DENY_AUTHORITY",
    TransitionDeniedError
  );
});

test("an actor who executed cannot QA its own execution even with a valid QA grant", () => {
  const h = harness();
  h.create();
  advanceTo(h, "AUTHORIZED");
  h.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "RUNNING", actorId: DUAL, authorityRef: "grant_dual" });
  h.send({
    requestedState: "SELF_VERIFIED",
    actorId: DUAL,
    authorityRef: "grant_dual",
    evidence: [{ ref: "ev_self", obligation: "self:unit-tests" }]
  });
  h.send({
    requestedState: "REVIEW",
    actorId: REV,
    authorityRef: "grant_rev",
    evidence: [{ ref: "ev_review", obligation: "review-report" }]
  });
  denies(() => h.send({ requestedState: "QA", actorId: DUAL, authorityRef: "grant_dual" }), "DENY_SOD");
});

// --- evidence sufficiency and independence ---

test("undeclared obligations are rejected at submission", () => {
  const h = harness();
  h.create();
  denies(() => h.send({ evidence: [{ ref: "ev_x", obligation: "not-declared" }] }), "DENY_UNKNOWN_OBLIGATION");
});

test("GOV_DECISION is denied while any evidence obligation is uncovered", () => {
  const h = harness();
  h.create();
  advanceTo(h, "SELF_VERIFIED");
  h.send({ requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "QA", actorId: QA_ACTOR, authorityRef: "grant_qa", evidence: [{ ref: "ev_qa", obligation: "qa-report" }] });
  denies(
    () => h.send({ requestedState: "GOV_DECISION", actorId: GOV, authorityRef: "grant_gov" }),
    "DENY_EVIDENCE_INSUFFICIENT"
  );
});

test("GOV_DECISION cannot manufacture missing lifecycle evidence in its own envelope", () => {
  const h = harness();
  h.create();
  advanceTo(h, "RUNNING");
  h.send({ requestedState: "SELF_VERIFIED", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "QA", actorId: QA_ACTOR, authorityRef: "grant_qa" });
  denies(() => h.send({
    requestedState: "GOV_DECISION", actorId: GOV, authorityRef: "grant_gov",
    evidence: [
      { ref: "ev_gov_self", obligation: "self:unit-tests" },
      { ref: "ev_gov_review", obligation: "review-report" },
      { ref: "ev_gov_qa", obligation: "qa-report" }
    ]
  }), "DENY_OBLIGATION_STAGE");
});

test("executor-produced evidence cannot satisfy a review-stage obligation", () => {
  const h = harness();
  h.create();
  advanceTo(h, "RUNNING");
  h.send({
    requestedState: "SELF_VERIFIED",
    actorId: ENGIN,
    authorityRef: "grant_engin",
    evidence: [
      { ref: "ev_self", obligation: "self:unit-tests" },
      { ref: "ev_self_review", obligation: "review-report" }
    ]
  });
  h.send({ requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "QA", actorId: QA_ACTOR, authorityRef: "grant_qa", evidence: [{ ref: "ev_qa", obligation: "qa-report" }] });
  denies(
    () => h.send({ requestedState: "GOV_DECISION", actorId: GOV, authorityRef: "grant_gov" }),
    "DENY_EVIDENCE_ROLE_MISMATCH"
  );
});

// --- GOV-P009-07: obligation typing and stage/role binding ---

const TYPED_OBLIGATIONS = ["self:unit-tests", "review:report", "qa:report"];

test("unknown obligation type prefix is denied at creation", () => {
  const h = harness();
  denies(() => h.create({ evidence_obligations: ["weird:thing"] }), "DENY_OBLIGATION_TYPE");
});

test("project-scope binding: creation requires an effective project and approved repositories", () => {
  const resolverFor = (result) => new WorkPackageContractService({
    grants: grants(),
    now: () => new Date("2026-07-18T10:00:00Z"),
    projectResolver: () => result
  });
  const effective = (repositories) => ({
    allowed: true, projectId: PROJECT, version: 1, state: "ACTIVE",
    contract: { repositories }
  });
  const opts = (key) => ({ idempotencyKey: key, actorId: ENGIN, authorityRef: "grant_engin" });

  // Positive: allowed_paths inside an approved repository proceed
  const scoped = resolverFor(effective(["C:/laragon/www/SecB"]));
  assert.equal(scoped.createWorkPackage(draft(), opts("v002_ok")).state, "DRAFT");

  // Negative: non-effective project denies creation
  assert.throws(
    () => resolverFor({ allowed: false, code: "DENY_CONTRACT_REVOKED" }).createWorkPackage(draft(), opts("v002_rev")),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_PROJECT_NOT_EFFECTIVE"
  );
  // Negative: unapproved repository rejected
  assert.throws(
    () => resolverFor(effective(["D:/other-repo"])).createWorkPackage(draft(), opts("v002_repo")),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_REPOSITORY_SCOPE"
  );
  // Negative: prefix trickery is not containment ("...SecB-evil" is not inside "...SecB")
  assert.throws(
    () => resolverFor(effective(["C:/laragon/www/Sec"])).createWorkPackage(draft(), opts("v002_prefix")),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_REPOSITORY_SCOPE"
  );
  // Negative: '..' segments re-target the path and are rejected outright
  assert.throws(
    () => resolverFor(effective(["C:/laragon/www/SecB"])).createWorkPackage(
      draft({ allowed_paths: ["C:/laragon/www/SecB/../SecB-evil"] }), opts("v002_dotdot")),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_REPOSITORY_SCOPE"
  );
  assert.throws(
    () => resolverFor(effective(["C:/laragon/www/SecB"])).createWorkPackage(
      draft({ allowed_paths: ["C:/laragon/www/SecB/../other/secret"] }), opts("v002_escape")),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_REPOSITORY_SCOPE"
  );
  // Negative: blank repository entries cannot act as wildcards
  assert.throws(
    () => resolverFor(effective(["C:/laragon/www/SecB", ""])).createWorkPackage(draft(), opts("v002_blankrepo")),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_PROJECT_NOT_EFFECTIVE"
  );
  // Positive: a trailing-slash repository declaration still contains its children
  const trailing = resolverFor(effective(["C:/laragon/www/SecB/"]));
  assert.equal(trailing.createWorkPackage(draft(), opts("v002_trailing")).state, "DRAFT");
  // Negative: mismatched resolver contract denies
  assert.throws(
    () => resolverFor({ ...effective(["C:/laragon/www/SecB"]), projectId: "prj_other" }).createWorkPackage(draft(), opts("v002_mismatch")),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_PROJECT_NOT_EFFECTIVE"
  );
  // Config: non-function resolver refused
  assert.throws(
    () => new WorkPackageContractService({ grants: grants(), projectResolver: "yes" }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_CONFIG"
  );
});

test("legacy deny mode enforces the deprecation boundary for unprefixed obligations", () => {
  const strict = new WorkPackageContractService({
    grants: grants(),
    now: () => new Date("2026-07-18T10:00:00Z"),
    legacyObligations: "deny"
  });
  assert.throws(
    () => strict.createWorkPackage(draft(), { idempotencyKey: "idem_legacy", actorId: ENGIN, authorityRef: "grant_engin" }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_OBLIGATION_TYPE"
  );
  const typed = strict.createWorkPackage(
    draft({ evidence_obligations: ["self:unit-tests", "any:notes"] }),
    { idempotencyKey: "idem_typed", actorId: ENGIN, authorityRef: "grant_engin" }
  );
  assert.equal(typed.state, "DRAFT");
  assert.throws(
    () => new WorkPackageContractService({ grants: grants(), legacyObligations: "sometimes" }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_CONFIG"
  );
});

test("stage lock: typed obligation evidence cannot be attached outside its producing stage", () => {
  const h = harness();
  h.create({ evidence_obligations: TYPED_OBLIGATIONS });
  // reviewer pre-tagging qa evidence during planning review
  denies(
    () => h.send({
      requestedState: "PLANNED", actorId: ENGIN, authorityRef: "grant_engin",
      evidence: [{ ref: "ev_pre", obligation: "qa:report" }]
    }),
    "DENY_OBLIGATION_STAGE"
  );
  h.send({ requestedState: "PLANNED", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "REVIEWED", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "AUTHORIZED", actorId: GOV, authorityRef: "grant_gov" });
  h.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "RUNNING", actorId: ENGIN, authorityRef: "grant_engin" });
  // executor smuggling review evidence during self-verification
  denies(
    () => h.send({
      requestedState: "SELF_VERIFIED", actorId: ENGIN, authorityRef: "grant_engin",
      evidence: [{ ref: "ev_smuggle", obligation: "review:report" }]
    }),
    "DENY_OBLIGATION_STAGE"
  );
  h.send({
    requestedState: "SELF_VERIFIED", actorId: ENGIN, authorityRef: "grant_engin",
    evidence: [{ ref: "ev_self", obligation: "self:unit-tests" }]
  });
  h.send({ requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "QA", actorId: QA_ACTOR, authorityRef: "grant_qa", evidence: [{ ref: "ev_qa", obligation: "qa:report" }] });
  // GOV supplying the review artifact at decision time (the round-3 probe)
  denies(
    () => h.send({
      requestedState: "GOV_DECISION", actorId: GOV, authorityRef: "grant_gov",
      evidence: [{ ref: "ev_gov_review", obligation: "review:report" }]
    }),
    "DENY_OBLIGATION_STAGE"
  );
});

test("typed obligations: role-bound evidence at each stage reaches ACCEPTED", () => {
  const h = harness();
  h.create({ evidence_obligations: TYPED_OBLIGATIONS });
  h.send({ requestedState: "PLANNED", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "REVIEWED", actorId: REV, authorityRef: "grant_rev" });
  h.send({ requestedState: "AUTHORIZED", actorId: GOV, authorityRef: "grant_gov" });
  h.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "RUNNING", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({
    requestedState: "SELF_VERIFIED", actorId: ENGIN, authorityRef: "grant_engin",
    evidence: [{ ref: "ev_self", obligation: "self:unit-tests" }]
  });
  h.send({
    requestedState: "REVIEW", actorId: REV, authorityRef: "grant_rev",
    evidence: [{ ref: "ev_review", obligation: "review:report" }]
  });
  h.send({
    requestedState: "QA", actorId: QA_ACTOR, authorityRef: "grant_qa",
    evidence: [{ ref: "ev_qa", obligation: "qa:report" }]
  });
  h.send({ requestedState: "GOV_DECISION", actorId: GOV, authorityRef: "grant_gov" });
  const accepted = h.send({ requestedState: "ACCEPTED", actorId: GOV, authorityRef: "grant_gov" });
  assert.equal(accepted.state, "ACCEPTED");
});

// --- expiry ---

test("after expiry only REWORK, CANCELLED, and REVOKED remain reachable", () => {
  const h = harness();
  h.create();
  advanceTo(h, "AUTHORIZED");
  h.setNow("2026-08-02T00:00:00Z");
  denies(() => h.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" }), "DENY_EXPIRED");
  const cancelled = h.send({ requestedState: "CANCELLED", actorId: GOV, authorityRef: "grant_gov" });
  assert.equal(cancelled.state, "CANCELLED");
});

// --- effective resolution ---

test("effective resolution is fail-closed on every input", () => {
  const h = harness();
  h.create();
  assert.equal(h.service.resolveEffective(PROJECT, WP).code, "DENY_BASELINE_UNBOUND");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "DENY_NO_EFFECTIVE_VERSION");

  advanceTo(h, "AUTHORIZED");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: "deadbeef" }).code, "DENY_BASELINE_MISMATCH");
  const resolved = h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE });
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.version, 1);
  assert.equal(resolved.state, "AUTHORIZED");

  h.setNow("2026-08-02T00:00:00Z");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "DENY_EXPIRED");
});

test("effective resolution denies when the bound authorization grant expires before the package", () => {
  const grantSet = grants().map((grant) => grant.grantId === "grant_gov"
    ? { ...grant, validUntil: "2026-07-18T10:30:00Z" }
    : grant);
  const h = harness({ grantSet });
  h.create();
  advanceTo(h, "AUTHORIZED");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "ALLOW");
  h.setNow("2026-07-18T10:30:00.000Z");
  const expired = h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE });
  assert.equal(expired.effective, null);
  assert.equal(expired.code, "DENY_AUTHORITY_INEFFECTIVE");
});

test("effective resolution fails closed when the authoritative current-state source is omitted", () => {
  const h = harness({ omitAuthoritySource: true });
  h.create();
  advanceTo(h, "AUTHORIZED");
  const unresolved = h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE });
  assert.equal(unresolved.effective, null);
  assert.equal(unresolved.code, "DENY_AUTHORITY_INEFFECTIVE");
});

test("effective resolution revalidates mutable authoritative grant state after authorization", () => {
  const mutations = [
    ["revoked", (grant) => ({ ...grant, status: "REVOKED" })],
    ["inactive", (grant) => ({ ...grant, status: "INACTIVE" })],
    ["decision drift", (grant) => ({ ...grant, decisionId: "decision_replaced" })],
    ["version drift", (grant) => ({ ...grant, workPackageVersion: 2 })],
    ["scope drift", (grant) => ({ ...grant, projectId: "prj_other" })],
    ["actor drift", (grant) => ({ ...grant, actorId: "gov_replaced" })],
    ["role loss", (grant) => ({ ...grant, roles: [] })],
    ["transition loss", (grant) => ({ ...grant, allowedTransitions: grant.allowedTransitions.filter((edge) => edge !== "WorkPackage:REVIEWED->AUTHORIZED") })],
    ["SoD invalidation", (grant) => ({ ...grant, roles: ["GOV", "QA"] })]
  ];
  for (const [label, mutate] of mutations) {
    let currentGrants = grants();
    const h = harness({ authoritySource: () => currentGrants });
    h.create();
    advanceTo(h, "AUTHORIZED");
    assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "ALLOW", label);
    currentGrants = currentGrants.map((grant) => grant.grantId === "grant_gov" ? mutate(grant) : grant);
    assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "DENY_AUTHORITY_INEFFECTIVE", label);
  }
});

test("a newer authorized version implicitly supersedes the previous one", () => {
  const h = harness();
  h.create();
  advanceTo(h, "AUTHORIZED");
  h.create({ version: 2 });
  advanceTo(h, "AUTHORIZED", { version: 2 });
  const resolved = h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE });
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.version, 2);
});

test("authority grants are bound to one exact Work Package version", () => {
  const h = harness();
  denies(() => h.create({ version: 2 }, h.key(), { authorityRef: "grant_engin" }), "DENY_CREATE_AUTHORITY");
  h.create({ version: 2 });
  denies(
    () => h.send({ version: 2, requestedState: "PLANNED", actorId: ENGIN, authorityRef: "grant_engin" }),
    "DENY_AUTHORITY_VERSION_MISMATCH",
    TransitionDeniedError
  );
});

test("a higher authorized version freezes every transition on lower versions", () => {
  const authorized = harness();
  authorized.create();
  advanceTo(authorized, "AUTHORIZED");
  authorized.create({ version: 2 });
  advanceTo(authorized, "AUTHORIZED", { version: 2 });
  denies(() => authorized.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" }), "DENY_SUPERSEDED_VERSION");
  const ready = harness();
  ready.create();
  advanceTo(ready, "READY");
  ready.create({ version: 2 });
  advanceTo(ready, "AUTHORIZED", { version: 2 });
  denies(() => ready.send({ requestedState: "RUNNING", actorId: ENGIN, authorityRef: "grant_engin" }), "DENY_SUPERSEDED_VERSION");
});

test("transition replay is stable only for the same version", () => {
  const h = harness();
  h.create();
  h.create({ version: 2 });
  const idempotencyKey = "idem_cross_version";
  const evidence = [{ ref: "ev_cross_version" }];
  const applied = h.send({ idempotencyKey, evidence });
  const replayed = h.send({ idempotencyKey, evidence });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.transitionId, applied.transitionId);
  denies(() => h.send({
    version: 2, requestedState: "PLANNED", actorId: ENGIN,
    authorityRef: "grant_engin_v2", idempotencyKey
  }), "DENY_IDEMPOTENCY_CONFLICT");
});

test("revoking or cancelling a governing version never reactivates a superseded version", () => {
  for (const terminalState of ["REVOKED", "CANCELLED"]) {
    const h = harness();
    h.create();
    advanceTo(h, "AUTHORIZED");
    h.create({ version: 2 });
    advanceTo(h, "AUTHORIZED", { version: 2 });
    h.send({ version: 2, requestedState: terminalState, actorId: GOV, authorityRef: "grant_gov_v2" });
    const resolved = h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE });
    assert.equal(resolved.effective, null, terminalState);
    assert.equal(resolved.code, "DENY_GOVERNING_VERSION_INEFFECTIVE", terminalState);
  }
});

test("a revoked authorization is never effective and revocation is terminal", () => {
  const h = harness();
  h.create();
  advanceTo(h, "AUTHORIZED");
  const revoked = h.send({ requestedState: "REVOKED", actorId: GOV, authorityRef: "grant_gov" });
  assert.equal(revoked.state, "REVOKED");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "DENY_GOVERNING_VERSION_INEFFECTIVE");
  denies(() => h.send({ requestedState: "PLANNED" }), "DENY_UNDEFINED_TRANSITION");
});

// --- layer parity (RISK-P009-01) ---

test("every canonical WorkPackage edge is authority-gated exactly once across the two layers", () => {
  const machine = STATE_MACHINES.WorkPackage;
  for (const [current, targets] of Object.entries(machine)) {
    for (const target of targets) {
      const canonical = REQUIRED_ROLE[`WorkPackage:*->${target}`];
      const serviceGate = WORK_PACKAGE_SERVICE_ROLE_GATES[`${current}->${target}`];
      assert.ok(canonical || serviceGate, `ungated edge ${current}->${target}`);
      assert.ok(!(canonical && serviceGate), `doubly gated edge ${current}->${target}`);
    }
  }
  for (const key of Object.keys(WORK_PACKAGE_SERVICE_ROLE_GATES)) {
    const [current, target] = key.split("->");
    assert.ok(machine[current]?.includes(target), `service gate for undefined edge ${key}`);
  }
  for (const state of EFFECTIVE_STATES) {
    assert.ok(state in machine, `effective state ${state} is not canonical`);
  }
});

// ---------------------------------------------------------------------------
// Authority binding at the work-package boundary: the four refusals the
// deny-path ratchet still carried.
//
// These sit nearer SecB's stated mission than anything closed so far. SecB
// exists to assign and verify authority, and each of these is a way a work
// package could otherwise acquire authority it was never granted: from a source
// that is not a source, from a grant bound to no version, from evidence produced
// by the actor being checked, or from a validity window that means nothing.
// ---------------------------------------------------------------------------

test("DENY_AUTHORITY_SOURCE — an authority source that is not callable", () => {
  // The service reads its grants THROUGH this function on every decision rather
  // than holding a snapshot, so a non-callable source is not a configuration
  // typo — it is a service that cannot re-read authority at all.
  // `null` is absent from this list deliberately. Both the harness and the
  // service coalesce a nullish source to the default function, so null is NOT
  // refused — my first version asserted it was, and the code was right.
  for (const bad of ["grants", 42, {}, []]) {
    assert.throws(
      () => harness({ authoritySource: bad }),
      (e) => e.code === "DENY_AUTHORITY_SOURCE",
      `authoritySource ${JSON.stringify(bad)} must be refused`
    );
  }
});

test("DENY_INVALID_EXPIRY is SHADOWED — the contract schema refuses first, always", () => {
  // This deny path cannot fire through createWorkPackage. Every malformed
  // valid_until is rejected by contract validation as DENY_CONTRACT_INVALID
  // before the parse check is reached — including values chosen specifically to
  // pass a loose format check and fail Date.parse.
  //
  // That is not a defect and the check should stay: it is defence in depth, and
  // it becomes reachable the moment the schema loosens. But it is also not debt,
  // and recording it as "undemonstrated" would ask someone to write a test that
  // cannot be written without weakening the schema first.
  //
  // So what is asserted here is the SHADOWING, not the refusal: the stricter
  // check still precedes it. If the schema ever stops catching these, this test
  // fails and DENY_INVALID_EXPIRY becomes reachable and testable.
  const { create } = harness();
  for (const bad of ["not-a-date", "", "2026-13-01T00:00:00Z", "2026-01-32T00:00:00Z"]) {
    assert.throws(
      () => create({ valid_until: bad }),
      (e) => e.code === "DENY_CONTRACT_INVALID",
      `valid_until ${JSON.stringify(bad)} is expected to be refused by the SCHEMA, not by the parse check`
    );
  }
});



test("DENY_AUTHORITY_VERSION_UNBOUND — a grant that loses its version binding after creation", () => {
  // Reachable through submitTransition, NOT through createWorkPackage: that
  // caller wraps the same internal verdict as DENY_CREATE_AUTHORITY. The route
  // that matters is a grant which DEGRADES between creation and transition,
  // which is possible precisely because the service re-reads its authority
  // source on every decision instead of holding a snapshot.
  let live = grants();
  const service = new WorkPackageContractService({
    grants: live,
    authoritySource: () => live,
    now: () => new Date("2026-07-18T10:00:00Z")
  });
  service.createWorkPackage(draft(), { idempotencyKey: "c_vu", actorId: ENGIN, authorityRef: "grant_engin" });

  // The grant is still present and still ACTIVE. Only its binding to a work
  // package VERSION is gone — which is the whole point: an authority that no
  // longer says which version it authorises cannot authorise anything.
  live = grants().map((g) => (g.grantId === "grant_engin" ? { ...g, workPackageVersion: 0 } : g));

  denies(
    () => service.submitTransition({
      projectId: PROJECT, workPackageId: WP, version: 1, requestedState: "PLANNED",
      actorId: ENGIN, authorityRef: "grant_engin", policyDecision: "ALLOW",
      evidence: [{ ref: "ev_vu" }], idempotencyKey: "t_vu", reasonCode: "STEP"
    }),
    "DENY_AUTHORITY_VERSION_UNBOUND",
    // TransitionDeniedError, not WorkPackageServiceError: this refusal is raised
    // by the transition engine rather than by the service wrapper, which is why
    // the same verdict surfaces as DENY_CREATE_AUTHORITY on the create path.
    TransitionDeniedError
  );
});

test("DENY_EVIDENCE_INDEPENDENCE is SHADOWED — separation of duties refuses twice, first", () => {
  // Independence fails only when a covering item's actor is in executorActorIds.
  // The evidence filter admits a REVIEW-stage item only from record.reviewerActorId,
  // so the reviewer would have to BE the executor. Two SoD layers make that
  // impossible, and this asserts both rather than the refusal itself.
  //
  // Layer 1, configuration: a grant combining ENGIN and REV is refused when the
  // authority engine is built, before any work package exists.
  const conflicted = grants().map((g) =>
    g.grantId === "grant_engin" ? { ...g, roles: ["ENGIN", "REV"] } : g);
  assert.throws(
    () => new WorkPackageContractService({
      grants: conflicted, authoritySource: () => conflicted, now: () => new Date("2026-07-18T10:00:00Z")
    }),
    (e) => e.code === "SOD_ROLE_CONFLICT",
    "an ENGIN/REV actor must be unconfigurable"
  );

  // Layer 2, runtime: even a non-conflicting pair is barred from entering REVIEW
  // once it has executed. The existing DUAL (ENGIN+QA) case asserts the QA half;
  // this asserts that the prohibition set is the EXECUTOR set, which is what
  // makes the reviewer-is-executor case unreachable rather than merely unusual.
  const h = harness();
  h.create();
  advanceTo(h, "AUTHORIZED");
  h.send({ requestedState: "READY", actorId: ENGIN, authorityRef: "grant_engin" });
  h.send({ requestedState: "RUNNING", actorId: DUAL, authorityRef: "grant_dual" });
  h.send({
    requestedState: "SELF_VERIFIED", actorId: DUAL, authorityRef: "grant_dual",
    evidence: [{ ref: "ev_self", obligation: "self:unit-tests" }]
  });
  denies(
    () => h.send({ requestedState: "REVIEW", actorId: DUAL, authorityRef: "grant_dual" }),
    "DENY_SOD"
  );
});
