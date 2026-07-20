import assert from "node:assert/strict";
import test from "node:test";
import { TransitionDeniedError, TransitionEngine } from "../src/control/state-machine.mjs";

function request(overrides = {}) {
  return {
    objectType: "Project",
    objectId: "prj_secb_local",
    objectVersion: 1,
    projectId: "prj_secb_local",
    workPackageId: "wp_p0_state_001",
    currentState: "DRAFT",
    requestedState: "REVIEW",
    actorId: "codex-local",
    authorityRef: "auth_local_001",
    policyDecision: "ALLOW",
    evidenceRefs: ["ev_context_001"],
    idempotencyKey: "idem_project_review_001",
    timestamp: "2026-07-17T12:30:00+07:00",
    reasonCode: "READY_FOR_REVIEW",
    ...overrides
  };
}

function authorizedEngine() {
  return new TransitionEngine({
    authorize: ({ authorityRef }) => authorityRef === "auth_local_001"
      ? { allowed: true, decisionId: "decision_local_001" }
      : { allowed: false, reason: "authority not effective" }
  });
}

test("an authorized defined transition increments version and records authority", () => {
  const result = authorizedEngine().transition(request());
  assert.equal(result.state, "REVIEW");
  assert.equal(result.previousVersion, 1);
  assert.equal(result.objectVersion, 2);
  assert.equal(result.authorityDecisionId, "decision_local_001");
  assert.equal(result.replayed, false);
});

test("the exact authoritative decision instant is forwarded to the resolver", () => {
  const decisionTime = new Date("2026-07-17T05:30:00.000Z");
  let observed;
  const engine = new TransitionEngine({
    authorize: (context) => {
      observed = context.authorityDecisionTime;
      return { allowed: true, decisionId: "decision_time_001" };
    }
  });
  engine.transition(request({ authorityDecisionTime: decisionTime }));
  assert.strictEqual(observed, decisionTime);
});

test("an identical idempotent replay returns the original disposition", () => {
  const engine = authorizedEngine();
  const first = engine.transition(request());
  const replay = engine.transition(request());
  assert.equal(replay.transitionId, first.transitionId);
  assert.equal(replay.objectVersion, first.objectVersion);
  assert.equal(replay.replayed, true);
});

test("semantic replay is independent of object property order", () => {
  const engine = authorizedEngine();
  const original = request();
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  const first = engine.transition(original);
  const replay = engine.transition(reordered);
  assert.equal(replay.transitionId, first.transitionId);
  assert.equal(replay.replayed, true);
});

test("conflicting idempotency reuse fails closed", () => {
  const engine = authorizedEngine();
  engine.transition(request());
  assert.throws(
    () => engine.transition(request({ reasonCode: "DIFFERENT_REASON" })),
    (error) => error instanceof TransitionDeniedError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
});

const denialCases = [
  ["malformed request", () => authorizedEngine().transition(null), "DENY_MALFORMED_REQUEST"],
  ["missing required field", () => authorizedEngine().transition(request({ actorId: undefined })), "DENY_MISSING_FIELDS"],
  ["default authority resolver", () => new TransitionEngine().transition(request()), "DENY_AUTHORITY"],
  ["ineffective authority", () => authorizedEngine().transition(request({ authorityRef: "caller_claim" })), "DENY_AUTHORITY"],
  ["policy denial", () => authorizedEngine().transition(request({ policyDecision: "DENY" })), "DENY_POLICY"],
  ["missing evidence", () => authorizedEngine().transition(request({ evidenceRefs: [] })), "DENY_MISSING_EVIDENCE"],
  ["unknown object", () => authorizedEngine().transition(request({ objectType: "CallerObject" })), "DENY_UNKNOWN_OBJECT_TYPE"],
  ["unknown state", () => authorizedEngine().transition(request({ requestedState: "SELF_APPROVED" })), "DENY_UNKNOWN_STATE"],
  ["skipped transition", () => authorizedEngine().transition(request({ requestedState: "ACTIVE" })), "DENY_UNDEFINED_TRANSITION"],
  ["invalid version", () => authorizedEngine().transition(request({ objectVersion: 0 })), "DENY_INVALID_VERSION"],
  ["terminal state exit", () => authorizedEngine().transition(request({ objectType: "WorkPackage", currentState: "ACCEPTED", requestedState: "RUNNING" })), "DENY_UNDEFINED_TRANSITION"]
];

for (const [name, operation, code] of denialCases) {
  test(`${name} fails closed`, () => {
    assert.throws(operation, (error) => error instanceof TransitionDeniedError && error.code === code);
  });
}
