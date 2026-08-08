/**
 * Promotion admissibility — where composition meets separation of duties.
 *
 * The property under test is that an UNVERIFIABLE separation of duties BLOCKS
 * the promotion rather than annotating it. On this branch that makes every
 * promotion inadmissible, which is the correct answer and not a bug.
 *
 * Every denial has a paired positive, because a function that returns
 * INADMISSIBLE unconditionally satisfies any suite of denials.
 */

import { describe, it } from "node:test";
import assert from "node:assert";

import { evaluatePromotion, ADMISSIBILITY } from "../src/skills/promotion-evaluator.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const NOW = "2026-08-05T00:00:00Z";
const approval = (type, by) => ({ decision_id: `dec-${type}`, decision_type: type, approved_by: by, approved_at: NOW });

const DESCRIPTOR = {
  skill_id: "SECB-ARCH-009",
  package_name: "architecture-decision-record",
  display_name: "architecture-decision-record",
  version: "0.2.0",
  purpose: "Produce a bounded architecture decision record",
  risk_class: "R2",
  controls: ["review"]
};

const grant = (over = {}) => ({
  skill_id: "SECB-ARCH-009",
  version: "0.2.0",
  status: "PUBLISHED",
  project_scopes: ["prj_secb_local"],
  supported_runtimes: ["claude-code"],
  max_data_classification: "INTERNAL",
  evidence_refs: ["ev-1"],
  approval_history: [
    approval("HUMAN_PROMOTION", "alice"),
    approval("INDEPENDENT_REV", "bob"),
    approval("INDEPENDENT_QA", "carol")
  ],
  revocation_conditions: ["regression"],
  producer_actor_id: "dave",
  ...over
});

const SOURCE = { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" };

const evaluate = (over = {}) => evaluatePromotion({
  descriptor: DESCRIPTOR, grant: grant(), source: SOURCE, owner: "SKILL", ...over
});

describe("admissibility — the positive arm", () => {
  it("admits a promotion with three distinct approvers and a distinct producer", () => {
    const r = evaluate();
    assert.equal(r.verdict, ADMISSIBILITY.ADMISSIBLE);
    assert.equal(r.code, null);
    assert.ok(r.manifest, "an admissible promotion must carry the manifest it admits");
  });

  it("the admitted manifest satisfies the contract, not this test's idea of one", () => {
    assert.deepEqual(
      validateContract("skillManifest", evaluate().manifest),
      { kind: "skillManifest", valid: true }
    );
  });
});

describe("admissibility — an unverifiable SoD BLOCKS, it does not annotate", () => {
  it("no producer identity is INADMISSIBLE even though the composition is perfect", () => {
    // This is the state every promotion in this repository is in today.
    const r = evaluate({ grant: grant({ producer_actor_id: undefined }) });
    assert.equal(r.verdict, ADMISSIBILITY.INADMISSIBLE);
    assert.equal(r.code, "DENY_SOD_UNVERIFIABLE");
    assert.equal(r.manifest, null,
      "an inadmissible promotion must not hand back the manifest it refused");
  });

  it("distinguishes UNVERIFIABLE from VIOLATED, because the remedies differ", () => {
    const unverifiable = evaluate({ grant: grant({ producer_actor_id: undefined }) });
    const violated = evaluate({ grant: grant({ producer_actor_id: "bob" }) }); // bob also reviewed
    assert.equal(unverifiable.code, "DENY_SOD_UNVERIFIABLE");
    assert.equal(violated.code, "DENY_SOD_VIOLATED");
    assert.notEqual(unverifiable.code, violated.code,
      "'add the missing field' and 'the wrong person approved this' are different problems");
  });

  it("the producer holding an approval role is INADMISSIBLE", () => {
    for (const who of ["alice", "bob", "carol"]) {
      const r = evaluate({ grant: grant({ producer_actor_id: who }) });
      assert.equal(r.verdict, ADMISSIBILITY.INADMISSIBLE, who);
      assert.equal(r.code, "DENY_SOD_VIOLATED", who);
    }
    // Control: a producer who approved nothing is admitted, so the three above
    // are about the overlap and not about the fixture.
    assert.equal(evaluate().verdict, ADMISSIBILITY.ADMISSIBLE);
  });
});

describe("admissibility — a composition failure is reported as itself", () => {
  const cases = [
    ["author supplies a grant field", { descriptor: { ...DESCRIPTOR, project_scopes: ["x"] } }, "DENY_AUTHOR_SUPPLIED_GRANT"],
    ["grant names another skill", { grant: grant({ skill_id: "SECB-OTHER-1" }) }, "DENY_IDENTITY_MISMATCH"],
    ["no owner", { owner: undefined }, "DENY_NO_OWNER"],
    ["no source", { source: undefined }, "DENY_NO_SOURCE"]
  ];
  for (const [label, over, expected] of cases) {
    it(`${label} -> ${expected}`, () => {
      const r = evaluate(over);
      assert.equal(r.verdict, ADMISSIBILITY.INADMISSIBLE, label);
      assert.equal(r.code, expected, label);
      assert.equal(r.separationOfDuties, null,
        "SoD is not evaluated on a composition that failed; reporting a verdict for it would be inventing one");
    });
  }

  it("control: the same call without the defect is admissible", () => {
    assert.equal(evaluate().verdict, ADMISSIBILITY.ADMISSIBLE);
  });
});

describe("admissibility — SoD reads the composed history, not a separate one", () => {
  it("cannot be passed a clean history while the manifest carries a dirty one", () => {
    // The check runs on manifest.approval_history, which comes from the grant.
    // There is no second input a caller could disagree with it through.
    const dirty = grant({ approval_history: [approval("INDEPENDENT_QA", "dave"), approval("INDEPENDENT_REV", "dave")] });
    const r = evaluate({ grant: dirty });
    assert.equal(r.code, "DENY_SOD_VIOLATED");
    assert.equal(r.separationOfDuties.actorId, "dave");
  });
});

describe("admissibility — it evaluates, and does not promote", () => {
  it("exports no path that registers or resolves", async () => {
    const mod = await import("../src/skills/promotion-evaluator.mjs");
    assert.deepEqual(Object.keys(mod).sort(), ["ADMISSIBILITY", "evaluatePromotion"]);
  });
});

/**
 * WP-GOV-SOD1 — the producer identity comes from the governed record.
 *
 * It used to be a caller argument, which meant the party whose separation was
 * being checked supplied the value checked against them. `producer_actor_id` is
 * optional in skill-grant-record — so no existing record is invalidated, the
 * WP-SK-R1 pattern — and mandatory here.
 */
describe("admissibility — the producer is read from the grant, not from the caller", () => {
  it("a grant recording no producer is INADMISSIBLE however the caller is called", () => {
    const noProducer = grant({ producer_actor_id: undefined });
    for (const claim of [undefined, "dave", "alice"]) {
      const r = evaluatePromotion({
        descriptor: DESCRIPTOR, grant: noProducer, source: SOURCE, owner: "SKILL", producerActorId: claim
      });
      assert.equal(r.code, "DENY_SOD_UNVERIFIABLE",
        `a caller naming "${claim}" must not supply an identity the record does not carry`);
    }
  });

  it("the caller cannot override the recorded producer, in either direction", () => {
    // A caller claiming to be someone other than the record says is a
    // disagreement about who authored the skill, and preferring either side
    // would make one of them decorative.
    const r = evaluatePromotion({
      descriptor: DESCRIPTOR, grant: grant(), source: SOURCE, owner: "SKILL", producerActorId: "someone-else"
    });
    assert.equal(r.code, "DENY_PRODUCER_CONFLICT");
    assert.equal(r.separationOfDuties.recorded, "dave");
    assert.equal(r.separationOfDuties.caller, "someone-else");
  });

  it("a caller agreeing with the record is accepted", () => {
    // The positive arm for the conflict check: agreement is not a conflict, so
    // the denial above is about the disagreement and not about the argument
    // being present at all.
    const r = evaluatePromotion({
      descriptor: DESCRIPTOR, grant: grant(), source: SOURCE, owner: "SKILL", producerActorId: "dave"
    });
    assert.equal(r.verdict, ADMISSIBILITY.ADMISSIBLE);
  });

  it("a recorded producer who also approved is still VIOLATED", () => {
    // Moving the identity into the record must not weaken the check it feeds.
    assert.equal(evaluate({ grant: grant({ producer_actor_id: "alice" }) }).code, "DENY_SOD_VIOLATED");
  });
});
