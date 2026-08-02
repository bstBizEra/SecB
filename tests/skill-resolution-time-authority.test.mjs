/**
 * WP-SK-R2 — DEF-R2 and DEF-R3.
 *
 * DEF-R2: `decisionLookup` was consulted only in `registerSkill`. `resolveSkill`
 * read a deep-frozen clone captured at registration and never revisited the
 * ledger, and there is no unregister API — so a grant, once made, could never
 * expire and never be revoked. Probe at the time: resolution after
 * `valid_until`, and after the decision was REVERTED, both returned ALLOW. That
 * is a live violation of governance-baseline section 3, which requires denial
 * when an approval "is expired, revoked, replayed, or for a different object".
 *
 * DEF-R3: `evidence_refs` was checked for length and nothing else, so
 * `evidence_refs: ["lol"]` registered successfully.
 *
 * EVERY test below asserts BOTH arms. A fail-closed change can always be made to
 * pass by denying everything; the positive arm is what makes the negative arm
 * mean anything.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionLedger } from "../src/ledger/temporal-ledgers.mjs";
import { SkillResolver } from "../src/registry/skill-resolver.mjs";

const IN_WINDOW = "2026-08-10T00:00:00Z";
const AFTER_EXPIRY = "2026-10-01T00:00:00Z";
const CONTEXT = { projectId: "prj_a", runtime: "claude-code", dataClassification: "INTERNAL" };

function manifest(overrides = {}) {
  return {
    skill_id: "SKILL-R2",
    version: "1.0.0",
    name: "skill-r2",
    status: "PUBLISHED",
    owner: "SKILL",
    source: { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" },
    purpose: "resolution-time authority fixture",
    supported_runtimes: ["claude-code"],
    project_scopes: ["prj_a"],
    max_data_classification: "INTERNAL",
    evidence_refs: ["ev1"],
    approval_history: [
      { decision_id: "d1", decision_type: "HUMAN_PROMOTION", approved_by: "human-gov", approved_at: "2026-08-02T00:00:00Z" }
    ],
    revocation_conditions: ["regression"],
    ...overrides
  };
}

function withLedger(run) {
  const dir = mkdtempSync(join(tmpdir(), "secb-wp-sk-r2-"));
  try {
    const ledger = new DecisionLedger({ filePath: join(dir, "d.ndjson") });
    ledger.appendDecision({
      decision_id: "d1", version: 1, project_id: "prj_a", work_package_id: "WP-SK-R2", session_id: "s1",
      actor_id: "human-gov", decision_type: "GOVERNANCE", outcome: "PROMOTE_SKILL",
      rationale: "fixture", authority_ref: "grant", evidence_refs: ["ev1"],
      decided_at: "2026-08-02T00:00:00Z", valid_from: "2026-08-02T00:00:00Z", valid_until: "2026-09-01T00:00:00Z"
    }, { expectedSequence: 0, idempotencyKey: "k1" });

    // A movable clock. The instant must be derived PER CALL: capturing one at
    // construction would make expiry permanently stale, which is the defect
    // being closed, wearing the clothes of its own fix.
    const clock = { now: IN_WINDOW };
    const resolver = new SkillResolver({
      decisionLookup: (ref, at) => ledger.resolveEffective(ref, { at: at ?? clock.now }).decision,
      evidenceLookup: (ref) => (ref === "ev1" ? { evidence_id: ref } : null),
      now: () => clock.now
    });
    return run({ ledger, resolver, clock });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("WP-SK-R2 / DEF-R2 — a grant stops authorizing when its decision does", () => {
  it("AC-R2-02: an expired decision denies at the next resolution, same process, no restart", () => {
    withLedger(({ resolver, clock }) => {
      resolver.registerSkill(manifest());
      assert.equal(resolver.resolveSkill("SKILL-R2", "1.0.0", CONTEXT).code, "ALLOW",
        "positive arm: an in-window decision must still authorize");

      clock.now = AFTER_EXPIRY;
      assert.equal(resolver.resolveSkill("SKILL-R2", "1.0.0", CONTEXT).code, "DENY_PROMOTION_NOT_EFFECTIVE");

      clock.now = IN_WINDOW;
      assert.equal(resolver.resolveSkill("SKILL-R2", "1.0.0", CONTEXT).code, "ALLOW",
        "the deny must be a live evaluation, not a latched permanent refusal");
    });
  });

  it("AC-R2-03: a REVERTED decision denies at the next resolution, same process, no restart", () => {
    withLedger(({ ledger, resolver }) => {
      resolver.registerSkill(manifest());
      assert.equal(resolver.resolveSkill("SKILL-R2", "1.0.0", CONTEXT).code, "ALLOW", "positive arm");

      ledger.appendDecision({
        decision_id: "d2", version: 1, project_id: "prj_a", work_package_id: "WP-SK-R2", session_id: "s1",
        actor_id: "human-gov", decision_type: "REVERSION", outcome: "REVERT",
        rationale: "withdrawn", authority_ref: "grant", evidence_refs: ["ev1"], reverts: "d1",
        decided_at: "2026-08-09T00:00:00Z", valid_from: "2026-08-09T00:00:00Z", valid_until: "2026-12-01T00:00:00Z"
      }, { expectedSequence: 1, idempotencyKey: "k2" });

      assert.equal(resolver.resolveSkill("SKILL-R2", "1.0.0", CONTEXT).code, "DENY_PROMOTION_NOT_EFFECTIVE");
    });
  });

  it("AC-R2-01: the lookup is consulted on EVERY resolution, not once at registration", () => {
    let calls = 0;
    const counting = new SkillResolver({
      decisionLookup: (ref) => { calls += 1; return { decision_id: ref, decision_type: "GOVERNANCE" }; },
      evidenceLookup: (ref) => ({ evidence_id: ref }),
      now: () => IN_WINDOW
    });
    counting.registerSkill(manifest());
    const afterRegister = calls;
    counting.resolveSkill("SKILL-R2", "1.0.0", CONTEXT);
    counting.resolveSkill("SKILL-R2", "1.0.0", CONTEXT);
    assert.equal(calls, afterRegister + 2, "one lookup per resolution per promotion entry");
  });

  it("a lookup that throws denies rather than escaping as a raw Error", () => {
    const throwing = new SkillResolver({
      decisionLookup: () => { throw new Error("ledger unavailable"); },
      evidenceLookup: (ref) => ({ evidence_id: ref }),
      now: () => IN_WINDOW
    });
    assert.throws(
      () => throwing.registerSkill(manifest()),
      (error) => error.name === "SkillResolverError" && error.code === "DENY_UNAPPROVED_PUBLICATION",
      "a ledger outage must refuse the registration, not escape uncaught"
    );
  });
});

describe("WP-SK-R2 / DEF-R3 — evidence is resolved, not counted", () => {
  const base = { decisionLookup: () => ({ decision_id: "d1", decision_type: "GOVERNANCE" }), now: () => IN_WINDOW };

  it("AC-R2-05: an evidence reference that does not resolve denies at registration", () => {
    assert.doesNotThrow(
      () => new SkillResolver({ ...base, evidenceLookup: (ref) => ({ evidence_id: ref }) }).registerSkill(manifest()),
      "positive arm: resolvable evidence must register"
    );
    assert.throws(
      () => new SkillResolver({ ...base, evidenceLookup: () => null }).registerSkill(manifest()),
      (error) => error.code === "DENY_UNVERIFIED_EVIDENCE"
    );
    assert.throws(
      () => new SkillResolver({ ...base, evidenceLookup: () => { throw new Error("down"); } }).registerSkill(manifest()),
      (error) => error.code === "DENY_UNVERIFIED_EVIDENCE"
    );
  });

  it("AC-R2-06 (amended): a PUBLISHED registration without an evidence lookup is refused", () => {
    // The work package asked for a constructor-level requirement. That would
    // break both production wirings, which this work package is forbidden to
    // touch, so it is enforced at the only point it bites. Recorded as an
    // amendment rather than silently weakened.
    assert.throws(
      () => new SkillResolver(base).registerSkill(manifest()),
      (error) => error.code === "DENY_UNVERIFIED_EVIDENCE"
    );
    assert.doesNotThrow(
      () => new SkillResolver(base).registerSkill(manifest({ status: "CANDIDATE", approval_history: [], evidence_refs: [] })),
      "a non-PUBLISHED registration needs no evidence lookup"
    );
  });
});
