/**
 * WP-SK-R1 — DEF-R1. A governance decision now names what it authorizes.
 *
 * Before this, one legitimately-minted HUMAN_PROMOTION was a master key. The
 * three lines below are not a hypothesis; they are the published result in
 * docs/04-assurance/skillshub-walking-skeleton-001.md, run against this
 * resolver:
 *
 *     the skill the decision named                    -> ALLOW
 *     a completely unrelated skill                    -> ALLOW
 *     a manifest that widened its own project_scopes
 *     and raised its own max_data_classification      -> ALLOW
 *
 * This suite exists to hold the last two at DENY. Because the "before" is
 * committed, these assertions cannot be quietly re-baselined: anyone weakening
 * them has to argue with a published measurement.
 *
 * EVERY TEST ASSERTS BOTH ARMS. A fail-closed change can always be made to pass
 * by denying everything, and the positive arm is what makes the negative arms
 * mean anything.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceLedger } from "../src/ledger/governed-ledgers.mjs";
import { DecisionLedger } from "../src/ledger/temporal-ledgers.mjs";
import { SkillResolver } from "../src/registry/skill-resolver.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const NOW = "2026-08-03T00:00:00Z";
const UNTIL = "2026-11-03T00:00:00Z";
const BASE = {
  version: 1, project_id: "prj_secb_local", work_package_id: "WP-SK-R1",
  session_id: "sess-r1", actor_id: "claude-code"
};
const CTX = { projectId: "prj_secb_local", runtime: "claude-code", dataClassification: "INTERNAL" };
const sha = (s) => createHash("sha256").update(s).digest("hex");

const GRANT = {
  project_scopes: ["prj_secb_local"],
  supported_runtimes: ["claude-code"],
  max_data_classification: "INTERNAL"
};

function manifest(overrides = {}) {
  return {
    skill_id: "SKILL-A", version: "1.0.0", name: "skill-a", status: "PUBLISHED", owner: "SKILL",
    source: { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" },
    purpose: "subject binding fixture",
    supported_runtimes: ["claude-code"], project_scopes: ["prj_secb_local"],
    max_data_classification: "INTERNAL", evidence_refs: ["ev-1"],
    approval_history: [{ decision_id: "dec-1", decision_type: "HUMAN_PROMOTION", approved_by: "operator", approved_at: NOW }],
    revocation_conditions: ["regression"],
    ...overrides
  };
}

function withLedgers(run, { subject = { kind: "SKILL_VERSION", id: "SKILL-A", version: "1.0.0", grant: GRANT } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "secb-r1-"));
  try {
    const ev = new EvidenceLedger({ filePath: join(dir, "e.ndjson") });
    ev.appendEvidence({
      ...BASE, evidence_id: "ev-1", evidence_type: "evaluation-result", source: "local run",
      observed_at: NOW, procedure: "eval suite", result: "PASS", exit_status: 0,
      limitations: ["one run"], content_hash: sha("ev-1"), verification_status: "VERIFIED",
      classification: "INTERNAL", retention_policy: "90d"
    }, { expectedSequence: 0, idempotencyKey: "k1" });

    const dl = new DecisionLedger({ filePath: join(dir, "d.ndjson") });
    const decision = {
      ...BASE, decision_id: "dec-1", decision_type: "GOVERNANCE", outcome: "PROMOTE_SKILL",
      rationale: "eval passed", authority_ref: "operator", evidence_refs: ["ev-1"],
      decided_at: NOW, valid_from: NOW, valid_until: UNTIL
    };
    if (subject !== null) decision.subject = subject;
    dl.appendDecision(decision, { expectedSequence: 0, idempotencyKey: "k2" });

    const resolver = new SkillResolver({
      decisionLookup: (ref, at) => dl.resolveEffective(ref, { at: at ?? NOW }).decision,
      evidenceLookup: (ref) => ev.read().find((r) => r.entry.entryId === ref)?.entry.payload ?? null,
      now: () => NOW
    });
    return run({ resolver, dl, ev });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const attempt = (resolver, m, ctx = CTX) => {
  try {
    resolver.registerSkill(m);
    return resolver.resolveSkill(m.skill_id, m.version, ctx).code;
  } catch (error) {
    return error.code;
  }
};

describe("WP-SK-R1 / DEF-R1 — the three published cases", () => {
  it("AC-R1-01 + AC-R1-02: the named skill still resolves; the other two now deny", () => {
    withLedgers(({ resolver }) => {
      // Positive arm first. Without it the two denials below prove only that
      // something is broken.
      assert.equal(attempt(resolver, manifest()), "ALLOW",
        "the skill the decision names must still be promotable");

      assert.equal(
        attempt(resolver, manifest({ skill_id: "SKILL-UNRELATED", name: "unrelated" })),
        "DENY_SUBJECT_MISMATCH",
        "published as ALLOW before this change; a decision is not a master key"
      );

      assert.equal(
        attempt(resolver, manifest({
          skill_id: "SKILL-WIDE", name: "self-widened",
          project_scopes: ["prj_secb_local", "prj_someone_else", "prj_anything"],
          max_data_classification: "RESTRICTED"
        }), { ...CTX, dataClassification: "RESTRICTED" }),
        "DENY_SUBJECT_MISMATCH",
        "published as ALLOW before this change; a manifest may not widen its own grant"
      );
    });
  });

  it("version binds, because registering a widened version first would otherwise win", () => {
    withLedgers(({ resolver }) => {
      assert.equal(attempt(resolver, manifest()), "ALLOW");
      assert.equal(attempt(resolver, manifest({ version: "0.1.0" })), "DENY_SUBJECT_MISMATCH");
    });
  });

  it("each widening dimension is refused ON ITS OWN", () => {
    // The published self-widened case raised project_scopes AND
    // max_data_classification together, so the data-class check caught it and
    // the scope check was never exercised. Removing the scope comparison left
    // the suite green.
    //
    // The first repair was worse than the defect: it gave each case a distinct
    // skill_id to avoid DENY_DUPLICATE_SKILL, which made the IDENTITY check fire
    // first every time. Three tests that all asserted the same thing, while
    // reading as three dimensions. Each case now keeps the granted identity and
    // gets its own registry, so only the dimension under test can differ.
    const cases = [
      ["scope widening alone", { project_scopes: ["prj_secb_local", "prj_other"] }, CTX],
      ["runtime widening alone", { supported_runtimes: ["claude-code", "some-other-runtime"] }, CTX],
      ["data-class raising alone", { max_data_classification: "RESTRICTED" }, { ...CTX, dataClassification: "RESTRICTED" }]
    ];
    for (const [label, override, ctx] of cases) {
      withLedgers(({ resolver }) => {
        assert.equal(attempt(resolver, manifest(override), ctx), "DENY_SUBJECT_MISMATCH", label);
      });
    }
    // Control: the same shape with NO widening resolves, so the three denials
    // above are about the widening and not about the fixture.
    withLedgers(({ resolver }) => {
      assert.equal(attempt(resolver, manifest()), "ALLOW", "unwidened control must still resolve");
    });
  });

  it("a manifest NARROWER than its grant is fine; only claiming MORE is refused", () => {
    // Subset, not equality. A grant is a ceiling, not a specification.
    withLedgers(({ resolver }) => {
      assert.equal(
        attempt(resolver, manifest({ max_data_classification: "PUBLIC" }), { ...CTX, dataClassification: "PUBLIC" }),
        "ALLOW",
        "narrowing below the granted ceiling must not be treated as a mismatch"
      );
    });
  });
});

describe("WP-SK-R1 / AC-R1-03 — a decision with no subject", () => {
  it("cannot promote a skill, and remains valid for every other purpose", () => {
    withLedgers(({ resolver }) => {
      assert.equal(attempt(resolver, manifest()), "DENY_UNBOUND_SUBJECT");
    }, { subject: null });

    // The second half matters as much as the first: if the schema change had
    // broken existing records, the deny above would be right for the wrong
    // reason and every decision in the tree would be invalid.
    const legacy = {
      ...BASE, decision_id: "dec-legacy", decision_type: "GOVERNANCE", outcome: "PROMOTE_SKILL",
      rationale: "minted before subject existed", authority_ref: "operator",
      evidence_refs: ["ev-1"], decided_at: NOW, valid_from: NOW, valid_until: UNTIL
    };
    assert.deepEqual(validateContract("decisionRecord", legacy), { kind: "decisionRecord", valid: true });
  });
});

describe("WP-SK-R1 / AC-R1-04 — no existing decision record is invalidated", () => {
  it("the committed valid fixture still validates unchanged", async () => {
    const { readFileSync } = await import("node:fs");
    const fixture = JSON.parse(readFileSync("tests/fixtures/valid/decision-record.json", "utf8"));
    assert.equal(fixture.subject, undefined, "the fixture predates subject; that is the point");
    assert.deepEqual(validateContract("decisionRecord", fixture), { kind: "decisionRecord", valid: true });
  });
});

describe("WP-SK-R1 — the contract accepts and refuses the right shapes", () => {
  const base = {
    ...BASE, decision_id: "d", decision_type: "GOVERNANCE", outcome: "x", rationale: "y",
    authority_ref: "z", evidence_refs: ["e"], decided_at: NOW, valid_from: NOW, valid_until: UNTIL
  };
  const check = (subject) => {
    try { validateContract("decisionRecord", { ...base, subject }); return "valid"; }
    catch (error) { return error.code ?? "error"; }
  };

  it("a SKILL_VERSION subject must carry version and grant", () => {
    assert.equal(check({ kind: "SKILL_VERSION", id: "S", version: "1.0.0", grant: GRANT }), "valid");
    assert.equal(check({ kind: "SKILL_VERSION", id: "S", grant: GRANT }), "DENY_CONTRACT_INVALID");
    assert.equal(check({ kind: "SKILL_VERSION", id: "S", version: "1.0.0" }), "DENY_CONTRACT_INVALID");
  });

  it("subject is closed — an unknown field is refused", () => {
    assert.equal(check({ kind: "SKILL_VERSION", id: "S", version: "1.0.0", grant: GRANT, extra: 1 }),
      "DENY_CONTRACT_INVALID");
  });
});

describe("WP-SK-R1 / AC-R1-06 — the deny codes keep their type through the hub", () => {
  it("both are named in the tally, and an unknown code still buckets", async () => {
    const { SecBSkillsHub } = await import("../src/skills/skills-hub-service.mjs");
    for (const code of ["DENY_SUBJECT_MISMATCH", "DENY_UNBOUND_SUBJECT"]) {
      const hub = new SecBSkillsHub({ services: { skillResolver: { resolveSkill: () => ({ skill: null, code }) } } });
      const result = hub.searchSkills("", CTX);
      assert.ok(result.withheld_reasons[code] > 0, `${code} must be distinguishable in the tally`);
      assert.equal(result.withheld_reasons.DENY_UNRESOLVED, undefined);
    }
    // Control: the allow-list is still an allow-list, not a pass-through.
    const unknown = new SecBSkillsHub({
      services: { skillResolver: { resolveSkill: () => ({ skill: null, code: "DENY_INVENTED" }) } }
    });
    assert.ok(unknown.searchSkills("", CTX).withheld_reasons.DENY_UNRESOLVED > 0);
  });
});

/**
 * A malformed grant from the ledger must DENY, not throw.
 *
 * Found by an independent code review. `subjectDenial` checked `if (!grant)`,
 * which catches null and undefined and nothing else, then dereferenced
 * `grant.project_scopes.includes(...)`. A ledger returning `grant: {}` produced
 * a raw TypeError with `code: undefined` out of both entry points.
 *
 * resolveSkill is documented to return a typed deny and never throw. Contract
 * validation does not cover this: the decision was validated when it was
 * appended, not when it was read back.
 */
describe("WP-SK-R1 — a malformed grant is a denial, not a crash", () => {
  const NOW_ = "2026-08-06T00:00:00Z";
  const manifest_ = () => ({
    skill_id: "S1", version: "1.0.0", name: "n", status: "PUBLISHED", owner: "SKILL",
    source: { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" },
    purpose: "p", supported_runtimes: ["claude-code"], project_scopes: ["prj"],
    max_data_classification: "INTERNAL", evidence_refs: ["ev"],
    approval_history: [{ decision_id: "d1", decision_type: "HUMAN_PROMOTION", approved_by: "op", approved_at: NOW_ }],
    revocation_conditions: ["r"]
  });
  const resolverWith = (subject) => new SkillResolver({
    decisionLookup: () => ({ decision_id: "d1", decision_type: "GOVERNANCE", subject }),
    evidenceLookup: () => ({ verification_status: "VERIFIED" }),
    now: () => NOW_
  });
  const attempt_ = (subject) => {
    try {
      const r = resolverWith(subject);
      r.registerSkill(manifest_());
      return r.resolveSkill("S1", "1.0.0", { projectId: "prj", runtime: "claude-code", dataClassification: "INTERNAL" }).code;
    } catch (error) {
      return error.code ?? `UNTYPED_${error.constructor.name}`;
    }
  };
  const WELL_FORMED = {
    kind: "SKILL_VERSION", id: "S1", version: "1.0.0",
    grant: { project_scopes: ["prj"], supported_runtimes: ["claude-code"], max_data_classification: "INTERNAL" }
  };

  it("every malformed grant shape denies with a code a caller can read", () => {
    const malformed = [
      ["empty object", {}],
      ["scopes not an array", { project_scopes: "prj", supported_runtimes: ["claude-code"], max_data_classification: "INTERNAL" }],
      ["runtimes not an array", { project_scopes: ["prj"], supported_runtimes: null, max_data_classification: "INTERNAL" }],
      ["unknown data class", { project_scopes: ["prj"], supported_runtimes: ["claude-code"], max_data_classification: "INVENTED" }],
      ["data class absent", { project_scopes: ["prj"], supported_runtimes: ["claude-code"] }]
    ];
    for (const [label, grant] of malformed) {
      const got = attempt_({ ...WELL_FORMED, grant });
      assert.equal(got, "DENY_SUBJECT_MISMATCH", `${label} produced ${got}`);
    }
  });

  it("the well-formed grant still resolves, so the denials are about the shape", () => {
    // Control. Without it the five denials above are satisfied by a resolver
    // that denies everything.
    assert.equal(attempt_(WELL_FORMED), "ALLOW");
  });
});

/**
 * The RESOLUTION-TIME subject check, pinned separately.
 *
 * Found by an independent code review and confirmed by sabotage: deleting the
 * subject comparison inside `#promotionsEffective` left this file green at
 * 11/0. Every other subject assertion here calls `registerSkill` first, and
 * registration throws before resolution ever runs — so the whole suite was
 * satisfied by the admission-time check alone, while DEF-R2's entire point is
 * that the decision is re-read at RESOLUTION.
 *
 * A skill that was legitimately promoted, and whose promotion decision is later
 * amended to name something else, must stop resolving. That is the case below,
 * and it is the only one in this file that registration cannot satisfy.
 */
describe("WP-SK-R2 / DEF-R2 — the subject is re-checked at resolution", () => {
  const NOW2 = "2026-08-06T00:00:00Z";
  const GRANT2 = { project_scopes: ["prj"], supported_runtimes: ["claude-code"], max_data_classification: "INTERNAL" };
  const CTX2 = { projectId: "prj", runtime: "claude-code", dataClassification: "INTERNAL" };
  const manifest2 = () => ({
    skill_id: "S1", version: "1.0.0", name: "n", status: "PUBLISHED", owner: "SKILL",
    source: { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" },
    purpose: "p", supported_runtimes: ["claude-code"], project_scopes: ["prj"],
    max_data_classification: "INTERNAL", evidence_refs: ["ev"],
    approval_history: [{ decision_id: "d1", decision_type: "HUMAN_PROMOTION", approved_by: "op", approved_at: NOW2 }],
    revocation_conditions: ["r"]
  });

  /** A ledger whose answer changes between the two reads. */
  const shiftingResolver = (subjects) => {
    let call = 0;
    return new SkillResolver({
      decisionLookup: () => ({
        decision_id: "d1", decision_type: "GOVERNANCE",
        subject: subjects[Math.min(call++, subjects.length - 1)]
      }),
      evidenceLookup: () => ({ verification_status: "VERIFIED" }),
      now: () => NOW2
    });
  };

  const MATCHING = { kind: "SKILL_VERSION", id: "S1", version: "1.0.0", grant: GRANT2 };
  const OTHER = { kind: "SKILL_VERSION", id: "S-SOMETHING-ELSE", version: "1.0.0", grant: GRANT2 };

  it("a promotion amended after registration stops the skill resolving", () => {
    const r = shiftingResolver([MATCHING, OTHER]);
    r.registerSkill(manifest2());                       // admitted: subject matches
    assert.equal(r.resolveSkill("S1", "1.0.0", CTX2).code, "DENY_SUBJECT_MISMATCH",
      "the decision now names another skill; resolution must not trust the admission");
  });

  it("a promotion that still matches keeps resolving", () => {
    // The positive arm. Without it the denial above is satisfied by a resolver
    // that denies every resolution, which is exactly what a broken re-check
    // would look like from the outside.
    const r = shiftingResolver([MATCHING, MATCHING]);
    r.registerSkill(manifest2());
    assert.equal(r.resolveSkill("S1", "1.0.0", CTX2).code, "ALLOW");
  });

  it("an amended promotion carrying no subject at all also stops it", () => {
    const r = shiftingResolver([MATCHING, undefined]);
    r.registerSkill(manifest2());
    assert.equal(r.resolveSkill("S1", "1.0.0", CTX2).code, "DENY_UNBOUND_SUBJECT");
  });
});

/**
 * Four guards that exist, are correct, and had nothing pinning them.
 *
 * Found by a 47-mutation sweep: each of the four could be disabled and the
 * whole 1162-test suite stayed green. No source change is needed — the code is
 * right. What was missing was any test that would notice it stopping.
 *
 * The reason each survived is the same in every case: every fixture in this
 * repository supplies well-formed, matching input, so the branch that handles
 * mismatched input is never taken.
 */
describe("guards the mutation sweep found unpinned", () => {
  const N = "2026-08-07T00:00:00Z";
  const G = { project_scopes: ["prj"], supported_runtimes: ["claude-code"], max_data_classification: "INTERNAL" };
  const C = { projectId: "prj", runtime: "claude-code", dataClassification: "INTERNAL" };
  const SUBJ = { kind: "SKILL_VERSION", id: "S1", version: "1.0.0", grant: G };
  const man = (o = {}) => ({
    skill_id: "S1", version: "1.0.0", name: "n", status: "PUBLISHED", owner: "SKILL",
    source: { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" },
    purpose: "p", supported_runtimes: ["claude-code"], project_scopes: ["prj"],
    max_data_classification: "INTERNAL", evidence_refs: ["ev"],
    approval_history: [{ decision_id: "d1", decision_type: "HUMAN_PROMOTION", approved_by: "op", approved_at: N }],
    revocation_conditions: ["r"], ...o
  });
  const res = (decision) => new SkillResolver({
    decisionLookup: () => decision,
    evidenceLookup: () => ({ verification_status: "VERIFIED" }),
    now: () => N
  });
  const GOOD = { decision_id: "d1", decision_type: "GOVERNANCE", subject: SUBJ };
  const go = (decision, manifest = man(), ctx = C) => {
    try {
      const r = res(decision);
      r.registerSkill(manifest);
      return r.resolveSkill(manifest.skill_id, manifest.version, ctx).code;
    } catch (e) { return e.code ?? `UNTYPED_${e.constructor.name}`; }
  };

  it("M12 — a decision whose id is not the one the manifest cites is refused", () => {
    // Every fixture returns a decision whose id already matches, so the
    // comparison was never exercised. The comment on that line calls a
    // fabricated entry "a forgery, not a formality gap".
    assert.equal(go({ ...GOOD, decision_id: "SOME-OTHER-DECISION" }), "DENY_UNAPPROVED_PUBLICATION");
    assert.equal(go(GOOD), "ALLOW", "the matching decision must still promote");
  });

  it("M12 — a decision that is not GOVERNANCE-typed is refused", () => {
    for (const type of ["OPERATIONAL", "ADVISORY", "", null]) {
      assert.equal(go({ ...GOOD, decision_type: type }), "DENY_UNAPPROVED_PUBLICATION", String(type));
    }
    assert.equal(go(GOOD), "ALLOW");
  });

  /**
   * The same two comparisons AT RESOLUTION, which the tests above do not reach.
   *
   * Sabotage proved it: disabling the id and GOVERNANCE-type check on line 165 —
   * the resolution-time copy — left this file green at 19/0, because every case
   * above is refused at registration first and resolution never runs.
   *
   * This is the identical masking pattern already documented three times in this
   * file, walked into a fourth time. A ledger whose answer changes between the
   * two reads is the only fixture that separates them.
   */
  const shifting = (decisions) => {
    let call = 0;
    return new SkillResolver({
      decisionLookup: () => decisions[Math.min(call++, decisions.length - 1)],
      evidenceLookup: () => ({ verification_status: "VERIFIED" }),
      now: () => N
    });
  };
  const afterRegister = (second) => {
    const r = shifting([GOOD, second]);
    r.registerSkill(man());
    return r.resolveSkill("S1", "1.0.0", C).code;
  };

  it("M12res — a decision amended to another id after registration stops resolution", () => {
    assert.equal(afterRegister({ ...GOOD, decision_id: "SOME-OTHER-DECISION" }), "DENY_PROMOTION_NOT_EFFECTIVE");
  });

  it("M12res — a decision amended to another TYPE after registration stops resolution", () => {
    assert.equal(afterRegister({ ...GOOD, decision_type: "OPERATIONAL" }), "DENY_PROMOTION_NOT_EFFECTIVE");
  });

  it("M12res — an unchanged decision still resolves", () => {
    // The positive arm for both of the above. Without it, a resolver that denied
    // every resolution would satisfy them.
    assert.equal(afterRegister(GOOD), "ALLOW");
  });

  it("M20 — a data classification outside the known ladder is refused, not compared", () => {
    // indexOf returns -1 for an unknown class, and -1 is below every real
    // index, so a ceiling comparison alone would wave it through.
    assert.equal(go(GOOD, man(), { ...C, dataClassification: "TOP_SECRET_INVENTED" }), "DENY_DATA_CLASSIFICATION");
    assert.equal(go(GOOD, man(), C), "ALLOW");
  });

  it("M23 — a PUBLISHED manifest citing no evidence at all is refused", () => {
    // The contract has no minItems, so an empty array is valid input. The
    // existing cases cover non-empty and non-resolving refs, never absent.
    //
    // The code is DENY_UNAPPROVED_PUBLICATION, not DENY_UNVERIFIED_EVIDENCE:
    // carrying no evidence at all is a publication that was never approvable,
    // while UNVERIFIED is for a reference that exists and does not resolve.
    // Asserted as measured rather than as first assumed.
    assert.equal(go(GOOD, man({ evidence_refs: [] })), "DENY_UNAPPROVED_PUBLICATION");
    assert.equal(go(GOOD, man({ evidence_refs: ["ev"] })), "ALLOW");
  });

  it("M26 — the same skill_id@version cannot be registered twice", () => {
    // skill-resolver.mjs relies on this: "without it, registering a widened
    // version FIRST simply wins". Nothing asserted it.
    const r = res(GOOD);
    r.registerSkill(man());
    assert.throws(() => r.registerSkill(man({ name: "impostor" })), (e) => e.code === "DENY_DUPLICATE_SKILL");

    /**
     * Positive arm. A DIFFERENT version registers — but only under a decision
     * whose subject names THAT version.
     *
     * The first draft of this arm reused the 1.0.0 decision for a 2.0.0
     * manifest and was refused DENY_SUBJECT_MISMATCH, which is DEF-R1's version
     * binding working exactly as intended. Written correctly, this arm now
     * proves the earlier refusal is about the collision and not about
     * registration being broken.
     */
    const r2 = res({ ...GOOD, subject: { ...SUBJ, version: "2.0.0" } });
    assert.doesNotThrow(() => r2.registerSkill(man({ version: "2.0.0" })));
  });
});

/**
 * Three more the sweep found unpinned. Same shape as the last five: the guard
 * exists, is correct, and nothing would notice it going.
 */
describe("guards the sweep found unpinned, second batch", () => {
  const N2 = "2026-08-07T00:00:00Z";
  const G2 = { project_scopes: ["prj"], supported_runtimes: ["claude-code"], max_data_classification: "INTERNAL" };
  const C2 = { projectId: "prj", runtime: "claude-code", dataClassification: "INTERNAL" };
  const S2 = { kind: "SKILL_VERSION", id: "S1", version: "1.0.0", grant: G2 };
  const D2 = { decision_id: "d1", decision_type: "GOVERNANCE", subject: S2 };
  const promo = (id) => ({ decision_id: id, decision_type: "HUMAN_PROMOTION", approved_by: "op", approved_at: N2 });
  const man2 = (o = {}) => ({
    skill_id: "S1", version: "1.0.0", name: "n", status: "PUBLISHED", owner: "SKILL",
    source: { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" },
    purpose: "p", supported_runtimes: ["claude-code"], project_scopes: ["prj"],
    max_data_classification: "INTERNAL", evidence_refs: ["ev"],
    approval_history: [promo("d1")], revocation_conditions: ["r"], ...o
  });
  const resolverFor = (lookup) => new SkillResolver({
    decisionLookup: lookup,
    evidenceLookup: () => ({ verification_status: "VERIFIED" }),
    now: () => N2
  });

  it("M22 — REGISTRATION itself refuses a mismatched subject, not just resolution", () => {
    // Disabling the registration-time subjectDenial left the suite green,
    // because the resolution-time copy covered for it and every existing test
    // reads the resolve() code. Assert the THROW at registration directly.
    const bad = resolverFor(() => ({ ...D2, subject: { ...S2, id: "S-SOMETHING-ELSE" } }));
    assert.throws(() => bad.registerSkill(man2()), (e) => e.code === "DENY_SUBJECT_MISMATCH");
    // Positive arm: the matching subject registers without throwing.
    assert.doesNotThrow(() => resolverFor(() => D2).registerSkill(man2()));
  });

  it("M30 — a subject with NO grant key at all denies rather than throwing", () => {
    // The existing cases cover a malformed grant ({}, wrong types). An ABSENT
    // grant took a different branch, and disabling it produced an untyped
    // TypeError with code undefined out of registerSkill.
    const noGrant = { kind: "SKILL_VERSION", id: "S1", version: "1.0.0" };
    let code;
    try {
      resolverFor(() => ({ ...D2, subject: noGrant })).registerSkill(man2());
      code = "REGISTERED";
    } catch (e) { code = e.code ?? `UNTYPED_${e.constructor.name}`; }
    assert.equal(code, "DENY_SUBJECT_MISMATCH", "an absent grant must be a typed denial, never a crash");
    assert.doesNotThrow(() => resolverFor(() => D2).registerSkill(man2()));
  });

  it("M10 — EVERY claimed promotion is re-resolved, not just the first", () => {
    // Truncating the loop to promotions.slice(0, 1) survived: no fixture had
    // more than one HUMAN_PROMOTION, so first-only and all were the same set.
    let call = 0;
    const r = resolverFor((ref) => {
      call += 1;
      // d1 always resolves; d2 stops being effective after registration.
      if (ref === "d1") return { ...D2, decision_id: "d1" };
      return call <= 2 ? { ...D2, decision_id: "d2" } : null;
    });
    r.registerSkill(man2({ approval_history: [promo("d1"), promo("d2")] }));
    assert.equal(r.resolveSkill("S1", "1.0.0", C2).code, "DENY_PROMOTION_NOT_EFFECTIVE",
      "the SECOND promotion went ineffective; scanning only the first would miss it");

    // Positive arm: both still effective resolves.
    const ok = resolverFor((ref) => ({ ...D2, decision_id: ref }));
    ok.registerSkill(man2({ approval_history: [promo("d1"), promo("d2")] }));
    assert.equal(ok.resolveSkill("S1", "1.0.0", C2).code, "ALLOW");
  });
});

/**
 * M21 — each missing context field on its own is DENY_UNBOUND_CONTEXT.
 *
 * The sweep found `isBlank(a) || isBlank(b) || isBlank(c)` could be changed to
 * `&&` and the suite stayed green. It does not open a hole — partial context
 * still denies — but it denies with the WRONG CODE, reporting
 * DENY_DATA_CLASSIFICATION for a caller who simply omitted a project. A caller
 * told the wrong reason fixes the wrong thing.
 *
 * The existing case passed `{}`, where all three are blank and both operators
 * agree. Only one-at-a-time separates them.
 */
describe("M21 — a partly-bound context is reported as unbound, not as something else", () => {
  const bare = () => new SkillResolver({ decisionLookup: () => null });
  const FULL = { projectId: "prj", runtime: "claude-code", dataClassification: "INTERNAL" };

  it("each field missing ALONE reports DENY_UNBOUND_CONTEXT", () => {
    for (const field of ["projectId", "runtime", "dataClassification"]) {
      const ctx = { ...FULL };
      delete ctx[field];
      assert.equal(bare().resolveSkill("S1", "1.0.0", ctx).code, "DENY_UNBOUND_CONTEXT",
        `omitting ${field} must be reported as unbound context, not as a policy refusal`);
    }
  });

  it("a fully-bound context gets past the binding check", () => {
    // The positive arm. Without it, a resolver reporting DENY_UNBOUND_CONTEXT
    // for everything would satisfy the three above. DENY_UNKNOWN_SKILL means the
    // context was accepted and the registry is simply empty.
    assert.equal(bare().resolveSkill("S1", "1.0.0", FULL).code, "DENY_UNKNOWN_SKILL");
  });
});
