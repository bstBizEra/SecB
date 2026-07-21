import assert from "node:assert/strict";
import test from "node:test";
import { AuthorityConfigurationError, AuthorityEngine, REQUIRED_ROLE } from "../src/control/authority-engine.mjs";
import { TransitionDeniedError, TransitionEngine } from "../src/control/state-machine.mjs";

const fixedNow = () => new Date("2026-07-17T12:45:00+07:00");

function grant(overrides = {}) {
  return {
    grantId: "grant_rev_001",
    decisionId: "decision_gov_001",
    actorId: "reviewer-001",
    projectId: "prj_secb_local",
    workPackageId: "wp_p0_authority_001",
    roles: ["REV"],
    allowedTransitions: ["WorkPackage:SELF_VERIFIED->REVIEW"],
    validFrom: "2026-07-17T00:00:00+07:00",
    validUntil: "2026-07-18T00:00:00+07:00",
    status: "ACTIVE",
    ...overrides
  };
}

function context(overrides = {}) {
  return {
    actorId: "reviewer-001",
    authorityRef: "grant_rev_001",
    projectId: "prj_secb_local",
    workPackageId: "wp_p0_authority_001",
    objectType: "WorkPackage",
    objectId: "wp_p0_authority_001",
    currentState: "SELF_VERIFIED",
    requestedState: "REVIEW",
    producerActorId: "producer-001",
    ...overrides
  };
}

test("authority is derived from an active scoped grant", () => {
  const engine = new AuthorityEngine({ grants: [grant()], now: fixedNow });
  assert.deepEqual(engine.authorize(context()), {
    allowed: true,
    decisionId: "decision_gov_001",
    grantId: "grant_rev_001",
    role: "REV"
  });
});

const denialCases = [
  ["unknown grant", { authorityRef: "caller-claim" }],
  ["wrong actor", { actorId: "producer-001" }],
  ["wrong project", { projectId: "other-project" }],
  ["undefined role rule", { requestedState: "BLOCKED" }]
];

for (const [name, overrides] of denialCases) {
  test(`${name} is denied`, () => {
    const engine = new AuthorityEngine({ grants: [grant()], now: fixedNow });
    assert.equal(engine.authorize(context(overrides)).allowed, false);
  });
}

test("expired and revoked grants are denied", () => {
  const expired = new AuthorityEngine({ grants: [grant({ validUntil: "2026-07-17T01:00:00+07:00" })], now: fixedNow });
  const revoked = new AuthorityEngine({ grants: [grant({ status: "REVOKED" })], now: fixedNow });
  assert.equal(expired.authorize(context()).allowed, false);
  assert.equal(revoked.authorize(context()).allowed, false);
});

test("producer cannot independently review its own work", () => {
  const engine = new AuthorityEngine({ grants: [grant()], now: fixedNow });
  assert.equal(engine.authorize(context({ producerActorId: "reviewer-001" })).code, "DENY_SOD");
});

test("conflicting roles in one scoped actor assignment are rejected", () => {
  assert.throws(
    () => new AuthorityEngine({
      grants: [
        grant({ roles: ["ENGIN"], allowedTransitions: ["WorkPackage:READY->RUNNING"] }),
        grant({ grantId: "grant_rev_002", roles: ["REV"] })
      ]
    }),
    (error) => error instanceof AuthorityConfigurationError && error.code === "SOD_ROLE_CONFLICT"
  );
});

test("malformed, duplicate, and invalid-window grants are rejected", () => {
  assert.throws(
    () => new AuthorityEngine({ grants: [{ grantId: "incomplete" }] }),
    (error) => error instanceof AuthorityConfigurationError && error.code === "INVALID_GRANT"
  );
  assert.throws(
    () => new AuthorityEngine({ grants: [grant(), grant()] }),
    (error) => error instanceof AuthorityConfigurationError && error.code === "DUPLICATE_GRANT_ID"
  );
  assert.throws(
    () => new AuthorityEngine({ grants: [grant({ validFrom: "2026-07-18T00:00:00+07:00", validUntil: "2026-07-17T00:00:00+07:00" })] }),
    (error) => error instanceof AuthorityConfigurationError && error.code === "INVALID_GRANT_WINDOW"
  );
});

test("missing required role and missing transition permission are denied", () => {
  const wrongRole = new AuthorityEngine({ grants: [grant({ roles: ["QA"] })], now: fixedNow });
  const wrongTransition = new AuthorityEngine({ grants: [grant({ allowedTransitions: ["Project:DRAFT->REVIEW"] })], now: fixedNow });
  assert.equal(wrongRole.authorize(context()).allowed, false);
  assert.equal(wrongTransition.authorize(context()).allowed, false);
});

test("evidence acceptor cannot accept evidence it produced", () => {
  const acceptGrant = grant({
    grantId: "grant_evidence_accept_001",
    actorId: "evidence-actor-001",
    roles: ["EVIDENCE_ACCEPTOR"],
    allowedTransitions: ["Evidence:VERIFIED->ACCEPTED"]
  });
  const engine = new AuthorityEngine({ grants: [acceptGrant], now: fixedNow });
  const decision = engine.authorize(context({
    actorId: "evidence-actor-001",
    authorityRef: "grant_evidence_accept_001",
    objectType: "Evidence",
    currentState: "VERIFIED",
    requestedState: "ACCEPTED",
    producerActorId: "evidence-actor-001"
  }));
  assert.equal(decision.code, "DENY_SOD");
});

test("authority engine integrates with governed transition enforcement", () => {
  const authority = new AuthorityEngine({ grants: [grant()], now: fixedNow });
  const transitions = new TransitionEngine({ authorize: authority.asTransitionResolver() });
  const result = transitions.transition({
    ...context(),
    objectVersion: 7,
    policyDecision: "ALLOW",
    evidenceRefs: ["ev_self_verify_001"],
    idempotencyKey: "idem_review_001",
    timestamp: "2026-07-17T12:45:00+07:00",
    reasonCode: "READY_FOR_REVIEW"
  });
  assert.equal(result.state, "REVIEW");
  assert.equal(result.authorityDecisionId, "decision_gov_001");
});

// MOD-EVID-S2 parity (table-driven old-vs-new): the S2 ladder relies on the
// authority role map already carrying the Evidence VERIFY/ACCEPT edges. This
// pins the ENTIRE map to its expected table, proving every existing
// authority-engine outcome is unchanged and the Evidence verify/accept entries
// are present exactly as the ladder requires. S2 made ZERO edits to
// authority-engine.mjs; this test is the parity lock for that claim.
test("MOD-EVID-S2 parity: the authority role map equals its expected table (Evidence verify/accept present, nothing else changed)", () => {
  assert.deepEqual({ ...REQUIRED_ROLE }, {
    "Project:*->REVIEW": "REV",
    "Project:*->APPROVED_NOT_EFFECTIVE": "GOV",
    "Project:*->ACTIVE": "GOV",
    "WorkPackage:*->RUNNING": "ENGIN",
    "WorkPackage:*->SELF_VERIFIED": "ENGIN",
    "WorkPackage:*->REVIEW": "REV",
    "WorkPackage:*->QA": "QA",
    "WorkPackage:*->GOV_DECISION": "GOV",
    "WorkPackage:*->ACCEPTED": "GOV",
    "Session:*->RUNNING": "ENGIN",
    "Session:*->REVIEW_HANDOFF": "ENGIN",
    "Session:*->COMPLETED": "QA",
    "Evidence:*->SEALED": "EVIDENCE_PRODUCER",
    "Evidence:*->VERIFIED": "EVIDENCE_VERIFIER",
    "Evidence:*->ACCEPTED": "EVIDENCE_ACCEPTOR"
  });
});

test("MOD-EVID-S2 parity: evidence verifier authority resolves for the VERIFIED edge", () => {
  const verifyGrant = grant({
    grantId: "grant_evidence_verify_001",
    actorId: "evidence-verifier-001",
    roles: ["EVIDENCE_VERIFIER"],
    allowedTransitions: ["Evidence:VERIFICATION_PENDING->VERIFIED"]
  });
  const engine = new AuthorityEngine({ grants: [verifyGrant], now: fixedNow });
  const decision = engine.authorize(context({
    actorId: "evidence-verifier-001",
    authorityRef: "grant_evidence_verify_001",
    objectType: "Evidence",
    currentState: "VERIFICATION_PENDING",
    requestedState: "VERIFIED",
    producerActorId: "producer-001"
  }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.role, "EVIDENCE_VERIFIER");
});

test("transition remains denied when authority scope does not match", () => {
  const authority = new AuthorityEngine({ grants: [grant()], now: fixedNow });
  const transitions = new TransitionEngine({ authorize: authority.asTransitionResolver() });
  assert.throws(
    () => transitions.transition({
      ...context({ projectId: "other-project" }),
      objectVersion: 7,
      policyDecision: "ALLOW",
      evidenceRefs: ["ev_self_verify_001"],
      idempotencyKey: "idem_review_denied_001",
      timestamp: "2026-07-17T12:45:00+07:00",
      reasonCode: "READY_FOR_REVIEW"
    }),
    (error) => error instanceof TransitionDeniedError && error.code === "DENY_AUTHORITY"
  );
});
