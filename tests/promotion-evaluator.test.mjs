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
  ...over
});

const SOURCE = { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" };

const evaluate = (over = {}) => evaluatePromotion({
  descriptor: DESCRIPTOR, grant: grant(), source: SOURCE, owner: "SKILL", producerActorId: "dave", ...over
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
    const r = evaluate({ producerActorId: undefined });
    assert.equal(r.verdict, ADMISSIBILITY.INADMISSIBLE);
    assert.equal(r.code, "DENY_SOD_UNVERIFIABLE");
    assert.equal(r.manifest, null,
      "an inadmissible promotion must not hand back the manifest it refused");
  });

  it("distinguishes UNVERIFIABLE from VIOLATED, because the remedies differ", () => {
    const unverifiable = evaluate({ producerActorId: undefined });
    const violated = evaluate({ producerActorId: "bob" }); // bob also reviewed
    assert.equal(unverifiable.code, "DENY_SOD_UNVERIFIABLE");
    assert.equal(violated.code, "DENY_SOD_VIOLATED");
    assert.notEqual(unverifiable.code, violated.code,
      "'add the missing field' and 'the wrong person approved this' are different problems");
  });

  it("the producer holding an approval role is INADMISSIBLE", () => {
    for (const who of ["alice", "bob", "carol"]) {
      const r = evaluate({ producerActorId: who });
      assert.equal(r.verdict, ADMISSIBILITY.INADMISSIBLE, who);
      assert.equal(r.code, "DENY_SOD_VIOLATED", who);
    }
    // Control: a producer who approved nothing is admitted, so the three above
    // are about the overlap and not about the fixture.
    assert.equal(evaluate({ producerActorId: "dave" }).verdict, ADMISSIBILITY.ADMISSIBLE);
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
    assert.deepEqual(r.separationOfDuties.detail.actors, ["dave"]);
  });
});

describe("admissibility — it evaluates, and does not promote", () => {
  it("exports no path that registers or resolves", async () => {
    const mod = await import("../src/skills/promotion-evaluator.mjs");
    assert.deepEqual(Object.keys(mod).sort(), ["ADMISSIBILITY", "evaluatePromotion"]);
  });
});
