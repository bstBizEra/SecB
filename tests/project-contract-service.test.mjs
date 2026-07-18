import assert from "node:assert/strict";
import test from "node:test";
import {
  ProjectContractService,
  ProjectContractServiceError
} from "../src/project/project-contract-service.mjs";

const NOW = "2026-07-17T15:00:00+07:00";

function candidate(overrides = {}) {
  return {
    project_id: "prj_secb_local",
    version: 1,
    profile_id: "software-engineering",
    status: "DRAFT",
    owners: ["human-gov"],
    repositories: ["C:/laragon/www/SecB"],
    risk_class: "R2",
    evidence_destination: "local://evidence/secb",
    valid_from: "2026-07-17T14:00:00+07:00",
    valid_until: "2026-07-17T18:00:00+07:00",
    approvals: [],
    ...overrides
  };
}

function authority(context) {
  return {
    allowed: true,
    decisionId: `decision_server_${context.requestedState.toLowerCase()}`,
    serverDerived: true
  };
}

function request(overrides = {}) {
  return {
    projectId: "prj_secb_local",
    version: 1,
    actorId: "agent_gov_001",
    authorityRef: "grant_gov_001",
    evidenceRefs: ["ev_gov_001"],
    idempotencyKey: "idem_001",
    timestamp: NOW,
    reasonCode: "GOV_DECISION",
    ...overrides
  };
}

function createService(options = {}) {
  return new ProjectContractService({
    authorize: authority,
    now: () => new Date(NOW),
    ...options
  });
}

function advanceToReview(service) {
  service.register(candidate());
  return service.submitForReview(request({
    actorId: "agent_archi_001",
    authorityRef: "grant_archi_001",
    idempotencyKey: "idem_review_001",
    reasonCode: "READY_FOR_GOV_REVIEW"
  }));
}

function advanceToApproved(service) {
  advanceToReview(service);
  return service.approve(request({ idempotencyKey: "idem_approve_001" }));
}

test("registers a valid draft without treating caller approvals as authority", () => {
  const service = createService();
  const record = service.register(candidate({ approvals: ["caller_self_approval"] }));
  assert.equal(record.state, "DRAFT");
  assert.deepEqual(record.contract.approvals, []);
  assert.equal(service.resolveEffective({ projectId: "prj_secb_local", version: 1 }).allowed, false);
});

test("unknown, malformed, and caller-active contracts fail closed", () => {
  const service = createService();
  assert.throws(() => service.register(null), hasCode("DENY_CONTRACT_INVALID"));
  assert.throws(() => service.register(candidate({ project_id: "" })), hasCode("DENY_CONTRACT_INVALID"));
  assert.throws(() => service.register(candidate({ status: "ACTIVE" })), hasCode("DENY_INITIAL_STATE"));
  assert.throws(
    () => service.resolveEffective({ projectId: "unknown", version: 1 }),
    hasCode("DENY_PROJECT_UNKNOWN")
  );
});

test("duplicate project identity and version is denied", () => {
  const service = createService();
  service.register(candidate());
  assert.throws(() => service.register(candidate()), hasCode("DENY_DUPLICATE_PROJECT_VERSION"));
});

test("approval is distinct from effectiveness", () => {
  const service = createService();
  advanceToApproved(service);
  const resolution = service.resolveEffective({ projectId: "prj_secb_local", version: 1 });
  assert.deepEqual(resolution, {
    allowed: false,
    code: "DENY_CONTRACT_NOT_ACTIVE",
    state: "APPROVED_NOT_EFFECTIVE"
  });
});

test("approval and activation require distinct server-derived decisions", () => {
  const service = createService({
    authorize: (context) => ({
      allowed: true,
      decisionId: context.requestedState === "REVIEW" ? "decision_review" : "decision_reused",
      serverDerived: true,
      context
    })
  });
  advanceToApproved(service);
  assert.throws(
    () => service.activate(request({ idempotencyKey: "idem_activate_001" })),
    hasCode("DENY_DECISION_REUSE")
  );
});

test("caller-declared decision, role, runtime, and approval arrays create no authority", () => {
  const service = createService({
    authorize: (context) => context.requestedState === "REVIEW"
      ? { allowed: true, decisionId: "decision_review", serverDerived: true }
      : { allowed: false }
  });
  advanceToReview(service);
  assert.throws(
    () => service.approve(request({
      decisionId: "caller_decision",
      role: "GOV",
      runtimeProduct: "Codex",
      approvals: ["caller_approval"]
    })),
    hasCode("DENY_AUTHORITY")
  );
});

test("non-server-derived authority response is denied", () => {
  const service = createService({
    authorize: (context) => ({
      allowed: true,
      decisionId: context.requestedState === "REVIEW" ? "decision_review" : "decision_untrusted",
      serverDerived: context.requestedState === "REVIEW"
    })
  });
  advanceToReview(service);
  assert.throws(() => service.approve(request()), hasCode("DENY_AUTHORITY"));
});

test("an active in-window contract resolves effectively", () => {
  const service = createService();
  advanceToApproved(service);
  const activation = service.activate(request({ idempotencyKey: "idem_activate_001" }));
  assert.equal(activation.state, "ACTIVE");
  const resolution = service.resolveEffective({ projectId: "prj_secb_local", version: 1 });
  assert.equal(resolution.allowed, true);
  assert.equal(resolution.projectId, "prj_secb_local");
  assert.equal(resolution.version, 1);
  assert.equal(resolution.contract.status, "ACTIVE");
  assert.deepEqual(resolution.contract.approvals, ["decision_server_approved_not_effective"]);
});

test("expired and not-yet-valid contracts fail closed", () => {
  const expired = createService({ now: () => new Date("2026-07-17T19:00:00+07:00") });
  advanceToApproved(expired);
  assert.throws(
    () => expired.activate(request({ idempotencyKey: "idem_expired_001" })),
    hasCode("DENY_CONTRACT_EXPIRED")
  );

  const future = createService({ now: () => new Date("2026-07-17T13:00:00+07:00") });
  advanceToApproved(future);
  assert.throws(
    () => future.activate(request({ idempotencyKey: "idem_future_001" })),
    hasCode("DENY_CONTRACT_NOT_YET_VALID")
  );
});

test("suspended and revoked contracts fail closed", () => {
  const suspended = createService();
  advanceToApproved(suspended);
  suspended.activate(request({ idempotencyKey: "idem_activate_suspended_001" }));
  suspended.suspend(request({ idempotencyKey: "idem_suspend_001" }));
  assert.equal(suspended.resolveEffective({ projectId: "prj_secb_local", version: 1 }).code, "DENY_CONTRACT_SUSPENDED");

  const revoked = createService();
  advanceToApproved(revoked);
  revoked.revoke(request({ idempotencyKey: "idem_revoke_001" }));
  assert.equal(revoked.resolveEffective({ projectId: "prj_secb_local", version: 1 }).code, "DENY_CONTRACT_REVOKED");
});

test("wrong project and wrong version transitions are denied", () => {
  const service = createService();
  advanceToReview(service);
  assert.throws(() => service.approve(request({ projectId: "other" })), hasCode("DENY_PROJECT_UNKNOWN"));
  assert.throws(() => service.approve(request({ version: 2 })), hasCode("DENY_PROJECT_VERSION_UNKNOWN"));
});

test("malformed transition request fails closed", () => {
  const service = createService();
  advanceToReview(service);
  assert.throws(() => service.approve(null), hasCode("DENY_MALFORMED_REQUEST"));
  assert.throws(
    () => service.approve(request({ evidenceRefs: [] })),
    hasCode("DENY_MISSING_EVIDENCE")
  );
});

test("idempotent replay is stable and conflicting replay is denied", () => {
  const service = createService();
  advanceToReview(service);
  const first = service.approve(request({ idempotencyKey: "idem_stable_001" }));
  const replay = service.approve(request({ idempotencyKey: "idem_stable_001" }));
  assert.equal(replay.replayed, true);
  assert.equal(replay.transitionId, first.transitionId);
  assert.throws(
    () => service.approve(request({ idempotencyKey: "idem_stable_001", reasonCode: "CONFLICT" })),
    hasCode("DENY_IDEMPOTENCY_CONFLICT")
  );
});

test("evidence references are deeply immutable across replay", () => {
  const service = createService();
  advanceToReview(service);
  const first = service.approve(request({ idempotencyKey: "idem_immutable_001" }));
  assert.throws(() => first.evidenceRefs.push("ev_tampered"), TypeError);
  const replay = service.approve(request({ idempotencyKey: "idem_immutable_001" }));
  assert.deepEqual(replay.evidenceRefs, ["ev_gov_001"]);
  assert.throws(() => replay.evidenceRefs.push("ev_tampered"), TypeError);
  assert.deepEqual(service.approve(request({ idempotencyKey: "idem_immutable_001" })).evidenceRefs, ["ev_gov_001"]);
});

test("non-string authority decision IDs fail closed", () => {
  const service = createService({
    authorize: () => ({ allowed: true, decisionId: { value: "forged" }, serverDerived: true })
  });
  service.register(candidate());
  assert.throws(
    () => service.submitForReview(request({ idempotencyKey: "idem_object_decision_001" })),
    hasCode("DENY_AUTHORITY")
  );
});

test("blank and whitespace-only authority decision IDs fail closed", () => {
  for (const decisionId of ["", "   ", "\t\r\n"]) {
    const service = createService({
      authorize: () => ({ allowed: true, decisionId, serverDerived: true })
    });
    service.register(candidate());
    assert.throws(
      () => service.submitForReview(request({ idempotencyKey: `idem_blank_decision_${decisionId.length}` })),
      hasCode("DENY_AUTHORITY")
    );
  }
});

test("non-string evidence references fail closed", () => {
  const service = createService();
  service.register(candidate());
  assert.throws(
    () => service.submitForReview(request({ evidenceRefs: [{ id: "forged" }] })),
    hasCode("DENY_INVALID_EVIDENCE")
  );
});

test("non-string idempotency keys fail closed before any transition", () => {
  const service = createService();
  service.register(candidate());

  for (const idempotencyKey of [{ key: "idem_object" }, ["idem_array"], 42, true, "   "]) {
    assert.throws(
      () => service.submitForReview(request({ idempotencyKey })),
      hasCode("DENY_INVALID_IDEMPOTENCY_KEY")
    );
  }

  const transition = service.submitForReview(request({ idempotencyKey: "idem_valid_after_rejections" }));
  assert.equal(transition.previousState, "DRAFT");
  assert.equal(transition.state, "REVIEW");
});

test("transition identity and provenance fields must be non-empty strings", () => {
  const invalidValues = [{ forged: true }, ["forged"], 42, true, "   "];
  for (const field of ["projectId", "actorId", "authorityRef", "reasonCode"]) {
    for (const value of invalidValues) {
      const service = createService();
      service.register(candidate());
      assert.throws(
        () => service.submitForReview(request({ [field]: value })),
        hasCode("DENY_INVALID_SCALAR")
      );
    }
  }
});

test("transition timestamps reject coercible non-string values", () => {
  const service = createService();
  service.register(candidate());
  assert.throws(
    () => service.submitForReview(request({
      timestamp: { toString: () => NOW },
      idempotencyKey: "idem_coercible_timestamp"
    })),
    hasCode("DENY_INVALID_TIMESTAMP")
  );
});

test("transition timestamps are recorded from the server clock", () => {
  const service = createService();
  service.register(candidate());
  const transition = service.submitForReview(request({
    timestamp: "2099-01-01T00:00:00Z",
    idempotencyKey: "idem_server_timestamp"
  }));
  assert.equal(transition.timestamp, new Date(NOW).toISOString());
});

test("activation uses one authoritative in-window timestamp for validation and recording", () => {
  const justBeforeExpiry = "2026-07-17T17:59:59.999+07:00";
  const atExpiry = "2026-07-17T18:00:00.000+07:00";
  const times = [NOW, NOW, justBeforeExpiry, atExpiry];
  let clockReads = 0;
  const service = createService({
    now: () => new Date(times[clockReads++] ?? atExpiry)
  });
  advanceToApproved(service);

  const activation = service.activate(request({ idempotencyKey: "idem_activation_single_time" }));

  assert.equal(activation.timestamp, new Date(justBeforeExpiry).toISOString());
  assert.equal(clockReads, 3);
  assert.ok(Date.parse(activation.timestamp) < Date.parse(candidate().valid_until));
});

test("identical successful activation replay returns its prior disposition after expiry", () => {
  let currentTime = NOW;
  const service = createService({ now: () => new Date(currentTime) });
  advanceToApproved(service);
  const activationRequest = request({ idempotencyKey: "idem_activation_replay_after_expiry" });
  const first = service.activate(activationRequest);

  currentTime = "2026-07-17T18:00:00.001+07:00";
  const replay = service.activate(activationRequest);

  assert.equal(replay.replayed, true);
  assert.equal(replay.transitionId, first.transitionId);
  assert.equal(replay.timestamp, first.timestamp);
  assert.equal(replay.state, "ACTIVE");
});

test("a new activation at the exact expiry boundary fails closed", () => {
  const atExpiry = "2026-07-17T18:00:00.000+07:00";
  const times = [NOW, NOW, atExpiry];
  let clockReads = 0;
  const service = createService({
    now: () => new Date(times[clockReads++] ?? atExpiry)
  });
  advanceToApproved(service);

  assert.throws(
    () => service.activate(request({ idempotencyKey: "idem_activation_at_expiry" })),
    hasCode("DENY_CONTRACT_EXPIRED")
  );
  assert.equal(clockReads, 3);
});

test("a changed activation replay remains a conflict after expiry", () => {
  let currentTime = NOW;
  const service = createService({ now: () => new Date(currentTime) });
  advanceToApproved(service);
  const activationRequest = request({ idempotencyKey: "idem_activation_conflict_after_expiry" });
  service.activate(activationRequest);

  currentTime = "2026-07-17T18:00:00.001+07:00";
  assert.throws(
    () => service.activate({ ...activationRequest, reasonCode: "CONFLICT_AFTER_EXPIRY" }),
    hasCode("DENY_IDEMPOTENCY_CONFLICT")
  );
});

test("blank evidence references fail closed", () => {
  const service = createService();
  service.register(candidate());
  assert.throws(
    () => service.submitForReview(request({ evidenceRefs: ["   "] })),
    hasCode("DENY_INVALID_EVIDENCE")
  );
});

test("effective resolutions are deeply frozen snapshots", () => {
  const service = createService();
  advanceToApproved(service);
  service.activate(request({ idempotencyKey: "idem_activate_frozen_resolution" }));

  const resolution = service.resolveEffective({ projectId: "prj_secb_local", version: 1 });
  assert.equal(Object.isFrozen(resolution), true);
  assert.equal(Object.isFrozen(resolution.contract), true);
  assert.equal(Object.isFrozen(resolution.contract.approvals), true);
  assert.equal(Object.isFrozen(resolution.contract.repositories), true);
  assert.throws(() => resolution.contract.approvals.push("forged"), TypeError);
  assert.throws(() => resolution.contract.repositories.push("C:/forged"), TypeError);

  const fresh = service.resolveEffective({ projectId: "prj_secb_local", version: 1 });
  assert.deepEqual(fresh.contract.approvals, ["decision_server_approved_not_effective"]);
  assert.deepEqual(fresh.contract.repositories, ["C:/laragon/www/SecB"]);
});

function hasCode(code) {
  return (error) => error instanceof ProjectContractServiceError && error.code === code;
}
