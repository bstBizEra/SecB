/**
 * Separation of duties, as far as this branch's contracts can express it.
 *
 * The property this suite defends is unusual: the check must REFUSE to say
 * SATISFIED on data this repository can currently produce. Every real manifest
 * here reaches UNVERIFIABLE, because no contract records who authored a skill.
 *
 * So the central test is not "does it catch a violation". It is "does it
 * decline to pass when it cannot see the half that matters" — and the sabotage
 * for it is making UNVERIFIABLE collapse into SATISFIED, which is exactly how
 * this check would fail silently in the wild.
 */

import { describe, it } from "node:test";
import assert from "node:assert";

import { assertSeparationOfDuties, SOD } from "../src/skills/separation-of-duties.mjs";

const NOW = "2026-08-05T00:00:00Z";
const approval = (type, by) => ({ decision_id: `dec-${type}-${by}`, decision_type: type, approved_by: by, approved_at: NOW });

const THREE_DISTINCT = [
  approval("HUMAN_PROMOTION", "alice"),
  approval("INDEPENDENT_REV", "bob"),
  approval("INDEPENDENT_QA", "carol")
];

describe("SoD — it refuses to pass on what this branch can actually produce", () => {
  it("returns UNVERIFIABLE when no producer is known, even with three distinct approvers", () => {
    const r = assertSeparationOfDuties({ approvalHistory: THREE_DISTINCT });
    assert.equal(r.verdict, SOD.UNVERIFIABLE,
      "three distinct approvers is not separation of duties while the author is unknown");
    assert.match(r.reason, /producer/i);
    assert.equal(r.detail.missing, "producerActorId");
  });

  it("returns SATISFIED only once a producer is supplied and is distinct", () => {
    // The positive arm. Without it, every assertion in this file is satisfied by
    // a function that returns UNVERIFIABLE unconditionally.
    const r = assertSeparationOfDuties({ approvalHistory: THREE_DISTINCT, producerActorId: "dave" });
    assert.equal(r.verdict, SOD.SATISFIED);
    assert.equal(r.detail.producer, "dave");
  });

  it("a real manifest from this repository reaches UNVERIFIABLE", () => {
    // What a caller would actually hand it today: approval_history carries
    // approved_by, and nothing anywhere carries the author.
    const asFound = [approval("HUMAN_PROMOTION", "operator")];
    assert.equal(assertSeparationOfDuties({ approvalHistory: asFound }).verdict, SOD.UNVERIFIABLE);
  });
});

describe("SoD — what it can catch, it catches", () => {
  it("the producer holding any approval role is VIOLATED", () => {
    for (const role of ["HUMAN_PROMOTION", "INDEPENDENT_REV", "INDEPENDENT_QA"]) {
      const history = THREE_DISTINCT.map((e) => (e.decision_type === role ? approval(role, "dave") : e));
      const r = assertSeparationOfDuties({ approvalHistory: history, producerActorId: "dave" });
      assert.equal(r.verdict, SOD.VIOLATED, role);
      assert.deepEqual(r.detail.roles, [role]);
    }
  });

  it("one actor holding two approval roles is VIOLATED even without a producer", () => {
    // This half IS checkable from the recorded data, and it must not wait for a
    // producer identity to fire.
    const r = assertSeparationOfDuties({
      approvalHistory: [approval("INDEPENDENT_REV", "bob"), approval("INDEPENDENT_QA", "bob")]
    });
    assert.equal(r.verdict, SOD.VIOLATED);
    assert.deepEqual(r.detail.actors, ["bob"]);
  });

  it("compares actors case- and whitespace-insensitively", () => {
    const r = assertSeparationOfDuties({
      approvalHistory: [approval("INDEPENDENT_REV", " Bob "), approval("INDEPENDENT_QA", "bob")]
    });
    assert.equal(r.verdict, SOD.VIOLATED, "casing must not defeat the comparison");
  });
});

describe("SoD — absent or malformed input is never a pass", () => {
  /**
   * The two anonymous cases SUPPLY A PRODUCER on purpose.
   *
   * Without one they reached UNVERIFIABLE through the missing-producer branch
   * instead of the anonymous-approval branch, and sabotage proved it: disabling
   * the anonymous guard entirely left this suite green at 13/0. A test that
   * passes for a different reason than the one in its name pins nothing.
   */
  const cases = [
    ["no arguments", undefined],
    ["no approval history", { approvalHistory: undefined }],
    ["empty approval history", { approvalHistory: [] }],
    ["an approval with no approved_by", {
      approvalHistory: [{ decision_type: "INDEPENDENT_QA", approved_at: NOW }, approval("INDEPENDENT_REV", "bob")],
      producerActorId: "dave"
    }],
    ["an approval with a blank approved_by", {
      approvalHistory: [approval("INDEPENDENT_QA", "   "), approval("INDEPENDENT_REV", "bob")],
      producerActorId: "dave"
    }]
  ];
  for (const [label, args] of cases) {
    it(`${label} -> UNVERIFIABLE`, () => {
      assert.equal(assertSeparationOfDuties(args).verdict, SOD.UNVERIFIABLE, label);
    });
  }

  it("control: the same shape with real actors is not UNVERIFIABLE", () => {
    // Otherwise the five denials above are satisfied by a function that never
    // returns anything else.
    assert.notEqual(
      assertSeparationOfDuties({ approvalHistory: THREE_DISTINCT, producerActorId: "dave" }).verdict,
      SOD.UNVERIFIABLE
    );
  });
});

describe("SoD — it verifies, and does not decide", () => {
  it("exports no path that could approve anything", async () => {
    const mod = await import("../src/skills/separation-of-duties.mjs");
    assert.deepEqual(Object.keys(mod).sort(), ["DISTINCT_ROLE_TYPES", "SOD", "assertSeparationOfDuties"]);
  });
});
