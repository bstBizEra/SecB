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

function grants() {
  const window = {
    projectId: PROJECT,
    workPackageId: WP,
    validFrom: "2026-07-01T00:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    status: "ACTIVE"
  };
  return [
    {
      ...window,
      grantId: "grant_engin",
      decisionId: "decision_engin",
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
      grantId: "grant_rev",
      decisionId: "decision_rev",
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
      grantId: "grant_qa",
      decisionId: "decision_qa",
      actorId: QA_ACTOR,
      roles: ["QA"],
      allowedTransitions: ["WorkPackage:REVIEW->QA", "WorkPackage:QA->BLOCKED"]
    },
    {
      ...window,
      grantId: "grant_gov",
      decisionId: "decision_gov",
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
      grantId: "grant_dual",
      decisionId: "decision_dual",
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

function harness({ start = "2026-07-18T10:00:00Z" } = {}) {
  let nowMs = Date.parse(start);
  let seq = 0;
  const service = new WorkPackageContractService({ grants: grants(), now: () => new Date(nowMs) });
  const key = () => `idem_${++seq}`;
  const setNow = (iso) => { nowMs = Date.parse(iso); };
  const create = (overrides = {}, idempotencyKey = key(), authority = {}) =>
    service.createWorkPackage(draft(overrides), {
      idempotencyKey,
      actorId: ENGIN,
      authorityRef: "grant_engin",
      ...authority
    });
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
      authorityRef,
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

test("executor-produced evidence cannot satisfy an independent obligation", () => {
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
    "DENY_EVIDENCE_INDEPENDENCE"
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

test("a revoked authorization is never effective and revocation is terminal", () => {
  const h = harness();
  h.create();
  advanceTo(h, "AUTHORIZED");
  const revoked = h.send({ requestedState: "REVOKED", actorId: GOV, authorityRef: "grant_gov" });
  assert.equal(revoked.state, "REVOKED");
  assert.equal(h.service.resolveEffective(PROJECT, WP, { baseline: BASELINE }).code, "DENY_NO_EFFECTIVE_VERSION");
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
