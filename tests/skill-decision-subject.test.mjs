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
