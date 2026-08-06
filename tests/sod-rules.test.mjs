import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthorityEngine
} from "../src/control/authority-engine.mjs";
import {
  AUTHORIZE_TIME_LADDER,
  CONFLICTING_ROLE_PAIRS,
  HANDOFF_ACCEPTANCE_LADDER,
  checkConflictingRoles,
  checkPairwiseDistinct,
  checkProhibitedActors,
  isWellFormedActorId,
  normalizeRole
} from "../src/control/sod-rules.mjs";

// ---------------------------------------------------------------------------
// Primitive unit tests
// ---------------------------------------------------------------------------

test("normalizeRole passes canonical roles through and maps declared aliases", () => {
  assert.equal(normalizeRole("REV"), "REV");
  assert.equal(normalizeRole("GOV"), "GOV");
  assert.equal(normalizeRole("independent_review"), "REV");
  assert.equal(normalizeRole("governance"), "GOV");
  assert.equal(normalizeRole("reviewer"), "REV");
  assert.equal(normalizeRole("producer"), "PRODUCER");
});

test("normalizeRole denies-by-default for malformed tokens", () => {
  assert.equal(normalizeRole(""), null);
  assert.equal(normalizeRole(undefined), null);
  assert.equal(normalizeRole(42), null);
});

test("checkConflictingRoles denies a conflicting pair and reports it", () => {
  const verdict = checkConflictingRoles(new Set(["ENGIN", "REV"]));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "SOD_ROLE_CONFLICT");
  assert.deepEqual(verdict.pair, ["ENGIN", "REV"]);
});

test("checkConflictingRoles permits an independent role set", () => {
  assert.deepEqual(checkConflictingRoles(new Set(["REV"])), { ok: true });
  assert.deepEqual(checkConflictingRoles(["ENGIN"]), { ok: true });
});

test("checkConflictingRoles normalizes aliases when asked", () => {
  // governance -> GOV conflicts with QA
  const verdict = checkConflictingRoles(["QA", "governance"], { normalize: true });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.pair, ["QA", "GOV"]);
});

test("checkConflictingRoles denies malformed input", () => {
  assert.equal(checkConflictingRoles(123).ok, false);
  assert.equal(checkConflictingRoles(123).code, "DENY_MALFORMED_ROLES");
});

test("checkProhibitedActors excludes an actor by prior-role history", () => {
  const verdict = checkProhibitedActors("REV", "a1", { producer: "a1" });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "DENY_SOD");
  assert.equal(verdict.message, "Separation of duties prohibits actor a1 from role REV");
});

test("checkProhibitedActors permits an independent actor and unknown roles", () => {
  assert.deepEqual(checkProhibitedActors("REV", "a2", { producer: "a1" }), { ok: true });
  // ENGIN carries no actor-history ladder entry -> never excluded.
  assert.deepEqual(checkProhibitedActors("ENGIN", "a1", { producer: "a1" }), { ok: true });
});

test("checkProhibitedActors accepts list/Set history values", () => {
  const bySet = checkProhibitedActors("GOV", "x", { producer: new Set(["p", "x"]) });
  const byList = checkProhibitedActors("GOV", "x", { producer: ["p", "x"] });
  assert.equal(bySet.ok, false);
  assert.equal(byList.ok, false);
});

test("checkProhibitedActors denies malformed role/actor inputs", () => {
  assert.equal(checkProhibitedActors("", "a1", {}).code, "DENY_MALFORMED_ROLES");
  assert.equal(checkProhibitedActors("REV", "", {}).code, "DENY_MALFORMED_ACTOR");
});

test("checkPairwiseDistinct denies a repeated actor and permits distinct ones", () => {
  const clash = checkPairwiseDistinct([
    { role: "REV", actorId: "same" },
    { role: "GOV", actorId: "same" }
  ]);
  assert.equal(clash.ok, false);
  assert.equal(clash.code, "DENY_SOD_NOT_DISTINCT");
  assert.equal(clash.actorId, "same");
  assert.deepEqual(clash.roles, ["REV", "GOV"]);
  assert.deepEqual(checkPairwiseDistinct(["a", "b", "c"]), { ok: true });
});

test("checkPairwiseDistinct skips absent parties", () => {
  assert.deepEqual(checkPairwiseDistinct([{ actorId: null }, { actorId: "only" }]), { ok: true });
});

// ---------------------------------------------------------------------------
// Parity: pre-extraction logic shape vs delegated AuthorityEngine
//
// The reference functions below are byte-for-byte the SoD logic authority-
// engine.mjs held before MOD-GOV-S1. Running the SAME scenario matrix through
// the reference and through the delegating engine proves identical outcomes,
// including exact deny codes.
// ---------------------------------------------------------------------------

// Pre-extraction config-time conflict detection (verbatim shape).
function referenceHasConflict(roles) {
  return CONFLICTING_ROLE_PAIRS.find(([left, right]) => roles.has(left) && roles.has(right));
}

// Pre-extraction authorize-time prohibited-actor ladder (verbatim shape).
function referenceProhibited(role, context) {
  const prohibitedActors = role === "REV"
    ? [context.producerActorId]
    : role === "QA"
      ? [context.producerActorId, context.reviewerActorId]
      : ["GOV", "EVIDENCE_ACCEPTOR"].includes(role)
        ? [context.producerActorId, context.reviewerActorId, context.qaActorId, context.evidenceVerifierActorId]
        : [];
  return prohibitedActors.filter(Boolean).includes(context.actorId);
}

test("parity: config-time conflict detection matches the primitive across role sets", () => {
  const roleUniverse = ["ENGIN", "REV", "QA", "GOV", "SKILL_PRODUCER", "SKILL_PUBLISHER", "EVIDENCE_PRODUCER", "EVIDENCE_ACCEPTOR"];
  let scenarios = 0;
  // all singletons and all unordered pairs
  for (let i = 0; i < roleUniverse.length; i += 1) {
    for (let j = i; j < roleUniverse.length; j += 1) {
      const roles = new Set(i === j ? [roleUniverse[i]] : [roleUniverse[i], roleUniverse[j]]);
      const reference = referenceHasConflict(roles);
      const primitive = checkConflictingRoles(roles);
      assert.equal(primitive.ok, reference === undefined, `conflict parity for ${[...roles].join("+")}`);
      if (reference) assert.deepEqual(primitive.pair, [...reference]);
      scenarios += 1;
    }
  }
  assert.equal(scenarios, 36);
});

test("parity: authorize-time ladder matches the primitive across role x actor matrix", () => {
  const roles = ["REV", "QA", "GOV", "EVIDENCE_ACCEPTOR", "ENGIN", "EVIDENCE_PRODUCER"];
  const actors = ["cand", "prod", "revw", "qaad", "verf", "none"];
  const context = {
    producerActorId: "prod",
    reviewerActorId: "revw",
    qaActorId: "qaad",
    evidenceVerifierActorId: "verf"
  };
  let scenarios = 0;
  for (const role of roles) {
    for (const actorId of actors) {
      const reference = referenceProhibited(role, { ...context, actorId });
      const primitive = checkProhibitedActors(role, actorId, {
        producer: context.producerActorId,
        reviewer: context.reviewerActorId,
        qa: context.qaActorId,
        evidenceVerifier: context.evidenceVerifierActorId
      });
      assert.equal(primitive.ok, !reference, `ladder parity for ${role}/${actorId}`);
      if (reference) {
        assert.equal(primitive.code, "DENY_SOD");
        assert.equal(primitive.message, `Separation of duties prohibits actor ${actorId} from role ${role}`);
      }
      scenarios += 1;
    }
  }
  assert.equal(scenarios, 36);
});

// End-to-end parity: full AuthorityEngine.authorize() outcomes are fixed by
// captured fixtures (pre-extraction outcomes incl. exact codes).
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

const engineParityCases = [
  {
    name: "allow: independent reviewer with active scoped grant",
    ctx: {},
    expect: { allowed: true, decisionId: "decision_gov_001", grantId: "grant_rev_001", role: "REV" }
  },
  {
    name: "deny SoD: producer reviews own work",
    ctx: { producerActorId: "reviewer-001" },
    expect: { allowed: false, code: "DENY_SOD" }
  },
  {
    name: "deny role-rule-missing: undefined transition",
    ctx: { requestedState: "BLOCKED" },
    expect: { allowed: false, code: "DENY_ROLE_RULE_MISSING" }
  },
  {
    name: "deny authority: wrong actor",
    ctx: { actorId: "producer-001" },
    expect: { allowed: false, code: "DENY_AUTHORITY" }
  }
];

test("parity: AuthorityEngine.authorize outcomes match captured fixtures", () => {
  for (const { name, ctx, expect } of engineParityCases) {
    const engine = new AuthorityEngine({ grants: [grant()], now: fixedNow });
    const result = engine.authorize(context(ctx));
    if (expect.allowed) {
      assert.deepEqual(result, expect, name);
    } else {
      assert.equal(result.allowed, false, name);
      assert.equal(result.code, expect.code, name);
    }
  }
});

// ---------------------------------------------------------------------------
// Config-equivalence: the other three SoD sites' rule shapes are expressible
// as configurations of these primitives (demonstration only; NO service is
// rewired in this slice).
// ---------------------------------------------------------------------------

test("config-equivalence: work-package-service conflicting-pairs shape", () => {
  // #serviceAuthorize gates service edges with no actor-history ladder; its
  // only SoD is the shared config-time conflicting-pairs check (via its
  // internal AuthorityEngine). Same pairs -> same verdict here.
  assert.equal(checkConflictingRoles(new Set(["REV", "QA"])).ok, false);
  assert.equal(checkConflictingRoles(new Set(["ENGIN"])).ok, true);
  // Service-gated edges impose no actor-history exclusion: an ENGIN edge never
  // excludes by prior role.
  assert.equal(checkProhibitedActors("ENGIN", "anyone", { producer: "anyone" }).ok, true);
});

test("config-equivalence: handoff-service SoD-at-acceptance shape", () => {
  // Reference reproduction of handoff-service.acceptHandoff() SoD block.
  function referenceHandoff(destinationRole, actorId, { sourceActorId, executors, reviewer, qa }) {
    const INDEPENDENCE_ROLES = ["REV", "QA", "GOV"];
    if (!INDEPENDENCE_ROLES.includes(destinationRole)) return true; // no SoD gate
    if (actorId === sourceActorId) return false;
    const prohibited = new Set(executors);
    if (["QA", "GOV"].includes(destinationRole) && reviewer) prohibited.add(reviewer);
    if (destinationRole === "GOV" && qa) prohibited.add(qa);
    return !prohibited.has(actorId);
  }

  const histories = [
    { sourceActorId: "src", executors: ["e1", "e2"], reviewer: "rv", qa: "qa" },
    { sourceActorId: "src", executors: [], reviewer: null, qa: null }
  ];
  const candidates = ["src", "e1", "rv", "qa", "fresh"];
  let scenarios = 0;
  for (const destinationRole of ["REV", "QA", "GOV"]) {
    for (const history of histories) {
      for (const actorId of candidates) {
        const reference = referenceHandoff(destinationRole, actorId, history);
        const primitive = checkProhibitedActors(destinationRole, actorId, {
          source: history.sourceActorId,
          executors: history.executors,
          reviewer: history.reviewer,
          qa: history.qa
        }, { ladder: HANDOFF_ACCEPTANCE_LADDER });
        assert.equal(primitive.ok, reference, `handoff parity ${destinationRole}/${actorId}`);
        scenarios += 1;
      }
    }
  }
  assert.equal(scenarios, 30);
});

test("config-equivalence: capability-registry promotion self-approval shape", () => {
  // Promotion requires an independent_review actor distinct from the producer.
  const producer = "maint-1";
  const selfApproval = checkPairwiseDistinct(
    [
      { role: normalizeRole("independent_review"), actorId: "maint-1" },
      { role: normalizeRole("producer"), actorId: producer }
    ],
    { code: "DENY_SELF_APPROVAL" }
  );
  assert.equal(selfApproval.ok, false);
  assert.equal(selfApproval.code, "DENY_SELF_APPROVAL");

  const independent = checkPairwiseDistinct(
    [
      { role: normalizeRole("independent_review"), actorId: "reviewer-2" },
      { role: normalizeRole("producer"), actorId: producer }
    ],
    { code: "DENY_SELF_APPROVAL" }
  );
  assert.equal(independent.ok, true);
  // The divergent vocabulary normalizes onto canonical REV/GOV/PRODUCER.
  assert.equal(normalizeRole("independent_review"), "REV");
  assert.equal(normalizeRole("governance"), "GOV");
});

// ---------------------------------------------------------------------------
// Actor-identifier admissibility
//
// Every case below is written with \u escapes, never a literal character, so
// the confusables under test stay visible in the source that tests them.
// ---------------------------------------------------------------------------

// The two reproductions that motivated the gate. Each asserts three things:
// the confusable pair denies, the SAME shape with the SAME actor spelled
// identically still denies as a self-approval, and two genuinely different
// actors still pass. Without all three, deleting the primitive's body and
// returning a constant would satisfy the test.
test("checkPairwiseDistinct denies a zero-width-space near-collision", () => {
  const attack = checkPairwiseDistinct([
    { role: "PRODUCER", actorId: "alice\u200b" },
    { role: "REV", actorId: "alice" }
  ]);
  assert.equal(attack.ok, false, "producer approving own work via U+200B must not be admitted");
  assert.equal(attack.code, "DENY_MALFORMED_ACTOR");

  assert.equal(
    checkPairwiseDistinct([
      { role: "PRODUCER", actorId: "alice" },
      { role: "REV", actorId: "alice" }
    ]).code,
    "DENY_SOD_NOT_DISTINCT",
    "the plain self-approval keeps its own deny code, not the malformed one"
  );
  assert.deepEqual(
    checkPairwiseDistinct([
      { role: "PRODUCER", actorId: "alice" },
      { role: "REV", actorId: "bob" }
    ]),
    { ok: true },
    "two real actors still pass"
  );
});

test("checkPairwiseDistinct denies a Cyrillic-homoglyph near-collision", () => {
  const attack = checkPairwiseDistinct([
    { role: "PRODUCER", actorId: "\u0430lice" },
    { role: "REV", actorId: "alice" }
  ]);
  assert.equal(attack.ok, false, "producer approving own work via U+0430 must not be admitted");
  assert.equal(attack.code, "DENY_MALFORMED_ACTOR");
  assert.equal(attack.actorId, "\u0430lice");
  assert.deepEqual(attack.roles, ["PRODUCER"]);

  assert.deepEqual(
    checkPairwiseDistinct([
      { role: "PRODUCER", actorId: "carol" },
      { role: "REV", actorId: "dave" }
    ]),
    { ok: true }
  );
});

test("checkPairwiseDistinct denies ids differing only by surrounding whitespace", () => {
  assert.equal(checkPairwiseDistinct([{ actorId: " alice" }, { actorId: "alice" }]).code, "DENY_MALFORMED_ACTOR");
  assert.equal(checkPairwiseDistinct([{ actorId: "alice\t" }, { actorId: "alice" }]).code, "DENY_MALFORMED_ACTOR");
  // An internal space is a legitimate identifier shape and stays admissible.
  assert.deepEqual(checkPairwiseDistinct([{ actorId: "alice smith" }, { actorId: "bob jones" }]), { ok: true });
});

test("checkProhibitedActors closes the same near-collisions on the claimant side", () => {
  assert.equal(checkProhibitedActors("REV", "alice\u200b", { producer: "alice" }).code, "DENY_MALFORMED_ACTOR");
  assert.equal(checkProhibitedActors("REV", "\u0430lice", { producer: "alice" }).code, "DENY_MALFORMED_ACTOR");
  // The ladder it protects still works in both directions.
  assert.equal(checkProhibitedActors("REV", "alice", { producer: "alice" }).code, "DENY_SOD");
  assert.deepEqual(checkProhibitedActors("REV", "alice", { producer: "bob" }), { ok: true });
});

test("checkProhibitedActors closes the near-collision on the history side too", () => {
  // Validating only the claimant leaves the exclusion open from the other end:
  // a prohibited producer recorded as "alice<U+200B>" would fail to match the
  // well-formed claimant "alice" and admit the review.
  assert.equal(checkProhibitedActors("REV", "alice", { producer: "alice\u200b" }).code, "DENY_MALFORMED_ACTOR");
  assert.equal(checkProhibitedActors("GOV", "x", { producer: ["p", "\u0430lice"] }).code, "DENY_MALFORMED_ACTOR");
  // A clean history still excludes and still permits.
  assert.equal(checkProhibitedActors("GOV", "p", { producer: ["p", "q"] }).code, "DENY_SOD");
  assert.deepEqual(checkProhibitedActors("GOV", "z", { producer: ["p", "q"] }), { ok: true });
});

test("a role with no ladder entry is unaffected by malformed history", () => {
  // ENGIN collects no prohibited actors, so there is nothing to validate and
  // nothing to deny \u2014 the gate must not invent an exclusion where none exists.
  assert.deepEqual(checkProhibitedActors("ENGIN", "alice", { producer: "alice\u200b" }), { ok: true });
  assert.deepEqual(checkProhibitedActors("ENGIN", "alice", { producer: "alice" }), { ok: true });
});

test("the denial names the invisible character instead of reprinting it", () => {
  const message = checkPairwiseDistinct([{ actorId: "alice\u200b" }, { actorId: "alice" }]).message;
  assert.match(message, /\\u200b/i, "an operator must be able to see what was wrong with the id");
  assert.equal(message.includes("\u200b"), false, "the raw invisible character must not survive into the message");
  // The readable part is still there.
  assert.match(message, /alice/);
});

test("isWellFormedActorId admits real identifier shapes and rejects the confusable repertoire", () => {
  for (const ok of ["a", "a1", "alice", "maint-1", "reviewer-2", "svc.account_9", "alice smith", "A"]) {
    assert.equal(isWellFormedActorId(ok), true, `${ok} is a shape this repository already uses`);
  }
  for (const bad of ["alice\u200b", "\u0430lice", " alice", "alice ", "alice\u200e", "alice\u0301", "ali\u00e7e", "", "\u00a0alice"]) {
    assert.equal(isWellFormedActorId(bad), false, `${JSON.stringify(bad)} must not be admissible`);
  }
  for (const bad of [42, null, undefined, {}]) {
    assert.equal(isWellFormedActorId(bad), false);
  }
});

test("the gate normalizes nothing, so no previously-distinct pair now collides", () => {
  // This is the compatibility claim the fix rests on: it is an admissibility
  // gate, not a comparison change. Case, punctuation and substring variants
  // were distinct actors before and remain distinct actors after \u2014 which is
  // also, stated plainly, what this fix does NOT close.
  for (const [left, right] of [
    ["Alice", "alice"],
    ["alice.b", "aliceb"],
    ["rn-team", "m-team"],
    ["l1ce", "llce"],
    ["alice", "alice@corp"]
  ]) {
    assert.deepEqual(
      checkPairwiseDistinct([{ role: "PRODUCER", actorId: left }, { role: "REV", actorId: right }]),
      { ok: true },
      `${left} vs ${right} was distinct before the gate and must stay distinct`
    );
  }
});

test("ladders and pairs remain frozen (immutable primitive config)", () => {
  assert.equal(Object.isFrozen(CONFLICTING_ROLE_PAIRS), true);
  assert.equal(Object.isFrozen(AUTHORIZE_TIME_LADDER), true);
  assert.equal(Object.isFrozen(HANDOFF_ACCEPTANCE_LADDER), true);
});
