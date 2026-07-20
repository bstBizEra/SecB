// MOD-GOV Slice S3 — Policy decision point facade tests.
//
// Scope: every deny stage has its own code and denies fail-closed (including
// on THROWING collaborators), stage ordering is deterministic, the human-
// approval gate never converts to an allow, decision-record candidates are
// schema-valid on both outcomes, and both the facade and its outputs are
// frozen. The facade is UNWIRED: nothing here touches state-machine.mjs or
// any service.

import assert from "node:assert/strict";
import test from "node:test";
import { createPolicyDecisionPoint, PolicyConfigurationError } from "../src/control/policy-decision-point.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const FIXED_NOW = new Date("2026-07-20T10:00:00Z");

function happyResolvers(overrides = {}) {
  return {
    identityResolver: (actorId) => ({ resolved: true, quarantined: false, identity: { agent_instance_id: actorId } }),
    contractResolver: () => ({ allowed: true, state: "ACTIVE" }),
    grantResolver: () => ({ allowed: true, decisionId: "dec_grant_001", roles: ["ENGIN"], history: { producer: "someone-else" } }),
    now: () => FIXED_NOW,
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    actor_id: "agent-engin-01",
    role: "ENGIN",
    action: "transition",
    target: { entity: "WorkPackage", transition: "READY->RUNNING" },
    risk_class: "R2",
    mutation_class: "M2",
    context: { project_id: "prj_secb_local", work_package_id: "wp_mod_gov_s3", session_id: "ses_s3_001" },
    ...overrides
  };
}

// --- Constructor fail-closed -------------------------------------------------

test("constructor requires every resolver function", () => {
  const base = happyResolvers();
  for (const key of ["identityResolver", "contractResolver", "grantResolver"]) {
    assert.throws(
      () => createPolicyDecisionPoint({ ...base, [key]: undefined }),
      (error) => error instanceof PolicyConfigurationError && error.code === "INVALID_RESOLVER"
    );
    assert.throws(
      () => createPolicyDecisionPoint({ ...base, [key]: "not-a-function" }),
      (error) => error.code === "INVALID_RESOLVER"
    );
  }
  assert.throws(() => createPolicyDecisionPoint(), PolicyConfigurationError);
  assert.throws(
    () => createPolicyDecisionPoint({ ...base, now: 42 }),
    (error) => error.code === "INVALID_RESOLVER"
  );
});

test("constructor rejects malformed sodRules and riskRegistry overrides", () => {
  const base = happyResolvers();
  assert.throws(
    () => createPolicyDecisionPoint({ ...base, sodRules: { normalizeRole: () => null } }),
    (error) => error.code === "INVALID_SOD_RULES"
  );
  assert.throws(
    () => createPolicyDecisionPoint({ ...base, riskRegistry: { riskProfile: () => ({ ok: false }) } }),
    (error) => error.code === "INVALID_RISK_REGISTRY"
  );
});

// --- Request shape (fail-closed, closed envelope) ----------------------------

test("malformed requests deny with DENY_MALFORMED_REQUEST and no candidate", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const cases = [
    null,
    "string",
    [],
    request({ extra_field: true }),
    request({ actor_id: "   " }),
    request({ role: "  " }),
    request({ mutation_class: "  " }),
    request({ target: "WorkPackage" }),
    request({ target: ["WorkPackage"] }),
    request({ target: { entity: "WorkPackage", surprise: 1 } }),
    request({ target: { entity: "  " } }),
    request({ target: { entity: "WorkPackage", transition: "  " } }),
    request({ context: "prj" }),
    request({ context: { project_id: "p", work_package_id: "w", session_id: "s", extra: 1 } }),
    request({ context: { project_id: "p", work_package_id: "w", session_id: " " } })
  ];
  for (const bad of cases) {
    const result = pdp.decide(bad);
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_MALFORMED_REQUEST");
    assert.equal(result.decisionRecordCandidate, null);
    assert.equal(result.serverDerived, false);
  }
});

test("missing required fields deny with DENY_MISSING_FIELDS", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  for (const key of ["actor_id", "role", "action", "target", "risk_class", "context"]) {
    const bad = request();
    delete bad[key];
    const result = pdp.decide(bad);
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_MISSING_FIELDS");
    assert.match(result.reason, new RegExp(key));
    assert.equal(result.decisionRecordCandidate, null);
  }
});

test("mutation_class is optional: a request without it can still allow", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const bare = request();
  delete bare.mutation_class;
  const result = pdp.decide(bare);
  assert.equal(result.decision, "ALLOW");
});

// --- Clock (gateway pattern) -------------------------------------------------

test("throwing or invalid clock denies with DENY_CLOCK_UNAVAILABLE and no candidate", () => {
  for (const now of [() => { throw new Error("no clock"); }, () => "not-a-date", () => new Date(Number.NaN)]) {
    const pdp = createPolicyDecisionPoint(happyResolvers({ now }));
    const result = pdp.decide(request());
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_CLOCK_UNAVAILABLE");
    assert.equal(result.decisionRecordCandidate, null);
  }
});

// --- Identity stage ----------------------------------------------------------

test("unresolved, quarantined, malformed, or throwing identity denies with DENY_IDENTITY", () => {
  const resolvers = [
    () => ({ resolved: false, quarantined: true, reason: "Unknown agent instance" }),
    () => null,
    () => "resolved",
    () => { throw new Error("registry offline"); }
  ];
  for (const identityResolver of resolvers) {
    const pdp = createPolicyDecisionPoint(happyResolvers({ identityResolver }));
    const result = pdp.decide(request());
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_IDENTITY");
  }
});

// --- Contract stage ----------------------------------------------------------

test("ineffective, malformed, or throwing contract resolution denies with DENY_CONTRACT_INEFFECTIVE", () => {
  const resolvers = [
    () => ({ allowed: false, code: "DENY_CONTRACT_EXPIRED" }),
    () => undefined,
    () => { throw new Error("store offline"); }
  ];
  for (const contractResolver of resolvers) {
    const pdp = createPolicyDecisionPoint(happyResolvers({ contractResolver }));
    const result = pdp.decide(request());
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_CONTRACT_INEFFECTIVE");
  }
});

// --- Authority stage ---------------------------------------------------------

test("missing grant, missing decisionId, or throwing grant resolver denies with DENY_AUTHORITY", () => {
  const resolvers = [
    () => ({ allowed: false, code: "DENY_AUTHORITY" }),
    () => ({ allowed: true }),
    () => ({ allowed: true, decisionId: "  " }),
    () => { throw new Error("grants unavailable"); }
  ];
  for (const grantResolver of resolvers) {
    const pdp = createPolicyDecisionPoint(happyResolvers({ grantResolver }));
    const result = pdp.decide(request());
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_AUTHORITY");
  }
});

// --- SoD stage (S1 primitive reuse) ------------------------------------------

test("a granted role set containing a conflicting pair denies with SOD_ROLE_CONFLICT", () => {
  const grantResolver = () => ({ allowed: true, decisionId: "dec_grant_001", roles: ["ENGIN", "REV"] });
  const pdp = createPolicyDecisionPoint(happyResolvers({ grantResolver }));
  const result = pdp.decide(request());
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "SOD_ROLE_CONFLICT");
});

test("the requested role is part of the conflict set even when the grant omits it", () => {
  // Grant carries only REV; requesting ENGIN forms the ENGIN/REV pair.
  const grantResolver = () => ({ allowed: true, decisionId: "dec_grant_001", roles: ["REV"] });
  const pdp = createPolicyDecisionPoint(happyResolvers({ grantResolver }));
  const result = pdp.decide(request({ role: "ENGIN" }));
  assert.equal(result.code, "SOD_ROLE_CONFLICT");
});

test("role aliases normalize before the conflict check", () => {
  // independent_review aliases to REV; combined with requested ENGIN it conflicts.
  const grantResolver = () => ({ allowed: true, decisionId: "dec_grant_001", roles: ["independent_review"] });
  const pdp = createPolicyDecisionPoint(happyResolvers({ grantResolver }));
  const result = pdp.decide(request({ role: "ENGIN" }));
  assert.equal(result.code, "SOD_ROLE_CONFLICT");
});

test("actor-history prohibition denies with DENY_SOD (producer may not review its own work)", () => {
  const grantResolver = () => ({
    allowed: true,
    decisionId: "dec_grant_001",
    roles: ["REV"],
    history: { producer: "agent-engin-01" }
  });
  const pdp = createPolicyDecisionPoint(happyResolvers({ grantResolver }));
  const result = pdp.decide(request({ role: "REV" }));
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_SOD");
});

test("a throwing SoD collaborator denies with DENY_SOD", () => {
  const sodRules = {
    normalizeRole: () => { throw new Error("sod down"); },
    checkConflictingRoles: () => ({ ok: true }),
    checkProhibitedActors: () => ({ ok: true })
  };
  const pdp = createPolicyDecisionPoint(happyResolvers({ sodRules }));
  const result = pdp.decide(request());
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_SOD");
});

// --- Risk gate (S2 registry reuse) -------------------------------------------

test("unknown risk class denies with DENY_UNKNOWN_RISK_CLASS", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const result = pdp.decide(request({ risk_class: "R9" }));
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_UNKNOWN_RISK_CLASS");
});

test("unknown mutation class denies with DENY_UNKNOWN_MUTATION_CLASS", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const result = pdp.decide(request({ mutation_class: "M9" }));
  assert.equal(result.code, "DENY_UNKNOWN_MUTATION_CLASS");
});

test("mutation above the risk ceiling denies with DENY_MUTATION_EXCEEDS", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const result = pdp.decide(request({ risk_class: "R2", mutation_class: "M3" }));
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_MUTATION_EXCEEDS");
  assert.match(result.reason, /ceiling M2/);
});

test("human-approval risk classes deny with DENY_HUMAN_APPROVAL_REQUIRED even inside the ceiling", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  for (const [risk_class, mutation_class] of [["R3", "M2"], ["R3", "M3"], ["R4", "M5"]]) {
    const result = pdp.decide(request({ risk_class, mutation_class }));
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_HUMAN_APPROVAL_REQUIRED");
  }
});

test("a throwing risk registry denies with DENY_UNKNOWN_RISK_CLASS", () => {
  const riskRegistry = {
    riskProfile: () => { throw new Error("registry down"); },
    isMutationAtMost: () => ({ ok: true })
  };
  const pdp = createPolicyDecisionPoint(happyResolvers({ riskRegistry }));
  const result = pdp.decide(request());
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_UNKNOWN_RISK_CLASS");
});

// --- Ordering determinism ----------------------------------------------------

test("stage order is deterministic: the earliest failing stage wins", () => {
  // Fails identity AND contract AND authority AND risk -> identity wins.
  const pdp = createPolicyDecisionPoint(happyResolvers({
    identityResolver: () => ({ resolved: false }),
    contractResolver: () => ({ allowed: false }),
    grantResolver: () => ({ allowed: false })
  }));
  assert.equal(pdp.decide(request({ risk_class: "R9" })).code, "DENY_IDENTITY");

  // Contract precedes authority.
  const pdp2 = createPolicyDecisionPoint(happyResolvers({
    contractResolver: () => ({ allowed: false }),
    grantResolver: () => ({ allowed: false })
  }));
  assert.equal(pdp2.decide(request()).code, "DENY_CONTRACT_INEFFECTIVE");

  // Authority precedes SoD and risk.
  const pdp3 = createPolicyDecisionPoint(happyResolvers({
    grantResolver: () => ({ allowed: false })
  }));
  assert.equal(pdp3.decide(request({ risk_class: "R9" })).code, "DENY_AUTHORITY");

  // SoD precedes risk.
  const pdp4 = createPolicyDecisionPoint(happyResolvers({
    grantResolver: () => ({ allowed: true, decisionId: "dec_grant_001", roles: ["ENGIN", "REV"] })
  }));
  assert.equal(pdp4.decide(request({ risk_class: "R9" })).code, "SOD_ROLE_CONFLICT");

  // Mutation-ceiling exceedance precedes the human-approval gate: R3 ceiling
  // is M3, so M5 denies on the ceiling, not on human approval.
  const pdp5 = createPolicyDecisionPoint(happyResolvers());
  assert.equal(pdp5.decide(request({ risk_class: "R3", mutation_class: "M5" })).code, "DENY_MUTATION_EXCEEDS");

  // Shape precedes clock: a malformed request never touches the clock.
  const pdp6 = createPolicyDecisionPoint(happyResolvers({ now: () => { throw new Error("no clock"); } }));
  assert.equal(pdp6.decide(request({ actor_id: "" })).code, "DENY_MISSING_FIELDS");
});

test("the same request decides to the same decision_id (deterministic candidate identity)", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const first = pdp.decide(request());
  const second = pdp.decide(request());
  assert.equal(first.decision, "ALLOW");
  assert.equal(first.decisionRecordCandidate.decision_id, second.decisionRecordCandidate.decision_id);
  // An allow and a deny of related requests never share a decision_id.
  const denied = pdp.decide(request({ risk_class: "R3" }));
  assert.notEqual(first.decisionRecordCandidate.decision_id, denied.decisionRecordCandidate.decision_id);
});

// --- Decision-record candidate (both outcomes) --------------------------------

test("ALLOW returns a schema-valid decision-record candidate bound to the grant decision", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const result = pdp.decide(request());
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.code, "ALLOW");
  const candidate = result.decisionRecordCandidate;
  assert.deepEqual(validateContract("decisionRecord", { ...candidate, evidence_refs: [...candidate.evidence_refs] }), {
    kind: "decisionRecord",
    valid: true
  });
  assert.equal(candidate.decision_type, "AUTHORITY");
  assert.equal(candidate.outcome, "ALLOW");
  assert.equal(candidate.actor_id, "agent-engin-01");
  assert.equal(candidate.project_id, "prj_secb_local");
  assert.equal(candidate.work_package_id, "wp_mod_gov_s3");
  assert.equal(candidate.session_id, "ses_s3_001");
  assert.equal(candidate.authority_ref, "dec_grant_001");
  assert.equal(candidate.decided_at, FIXED_NOW.toISOString());
  // Zero-width validity window: the candidate asserts no forward validity.
  assert.equal(candidate.valid_from, candidate.decided_at);
  assert.equal(candidate.valid_until, candidate.decided_at);
  assert.match(candidate.evidence_refs[0], /^pdp:request:[0-9a-f]{64}$/);
});

test("DENY returns a schema-valid candidate; authority_ref is the sentinel before a grant exists", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers({ identityResolver: () => ({ resolved: false }) }));
  const result = pdp.decide(request());
  const candidate = result.decisionRecordCandidate;
  assert.deepEqual(validateContract("decisionRecord", { ...candidate, evidence_refs: [...candidate.evidence_refs] }), {
    kind: "decisionRecord",
    valid: true
  });
  assert.equal(candidate.outcome, "DENY");
  assert.match(candidate.rationale, /^DENY_IDENTITY: /);
  assert.equal(candidate.authority_ref, "authority:not-established");
});

test("post-grant denials bind authority_ref to the established grant decision", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  const result = pdp.decide(request({ risk_class: "R3", mutation_class: "M2" }));
  assert.equal(result.code, "DENY_HUMAN_APPROVAL_REQUIRED");
  assert.equal(result.decisionRecordCandidate.authority_ref, "dec_grant_001");
  assert.deepEqual(
    validateContract("decisionRecord", {
      ...result.decisionRecordCandidate,
      evidence_refs: [...result.decisionRecordCandidate.evidence_refs]
    }),
    { kind: "decisionRecord", valid: true }
  );
});

// --- serverDerived honesty (K-16) --------------------------------------------

test("serverDerived is reported false on every outcome (the facade cannot mint server-derived identity)", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  assert.equal(pdp.decide(request()).serverDerived, false);
  assert.equal(pdp.decide(request({ risk_class: "R4" })).serverDerived, false);
  assert.equal(pdp.decide(null).serverDerived, false);
  // The closed decision-record schema has no serverDerived field, and the
  // candidate must not smuggle one in.
  assert.equal("serverDerived" in pdp.decide(request()).decisionRecordCandidate, false);
});

// --- Frozen facade, frozen outputs, frozen config -----------------------------

test("the facade, its results, and its candidates are frozen", () => {
  const pdp = createPolicyDecisionPoint(happyResolvers());
  assert.ok(Object.isFrozen(pdp));
  const result = pdp.decide(request());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.decisionRecordCandidate));
  assert.ok(Object.isFrozen(result.decisionRecordCandidate.evidence_refs));
  assert.throws(() => {
    "use strict";
    result.decision = "TAMPERED";
  }, TypeError);
});

test("mutating the options object after construction does not alter behavior", () => {
  const options = happyResolvers();
  const pdp = createPolicyDecisionPoint(options);
  options.grantResolver = () => ({ allowed: false });
  options.identityResolver = () => ({ resolved: false });
  options.now = () => { throw new Error("swapped"); };
  const result = pdp.decide(request());
  assert.equal(result.decision, "ALLOW");
});

// --- Unwired-by-construction guard -------------------------------------------

test("state-machine.mjs remains untouched by S3 (no PDP import)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(fileURLToPath(new URL("../src/control/state-machine.mjs", import.meta.url)), "utf8");
  assert.equal(source.includes("policy-decision-point"), false);
});
