/**
 * descriptor ⊕ grant → skillManifest.
 *
 * EVERY TEST ASSERTS BOTH ARMS. A composition that refuses everything passes any
 * suite of denials, so the positive arm is what makes the denials mean anything.
 *
 * The output is validated against the real contract rather than against a list
 * of fields written here. A test that checks the composer against its own idea
 * of a manifest proves the composer agrees with the test.
 */

import { describe, it } from "node:test";
import assert from "node:assert";

import { composeManifest, GRANT_ONLY_FIELDS } from "../src/skills/manifest-composition.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const NOW = "2026-08-05T00:00:00Z";

const descriptor = (over = {}) => ({
  skill_id: "SECB-ARCH-009",
  package_name: "architecture-decision-record",
  display_name: "architecture-decision-record",
  version: "0.2.0",
  purpose: "Produce a bounded architecture decision record",
  risk_class: "R2",
  controls: ["review"],
  ...over
});

const grant = (over = {}) => ({
  skill_id: "SECB-ARCH-009",
  version: "0.2.0",
  status: "PUBLISHED",
  project_scopes: ["prj_secb_local"],
  supported_runtimes: ["claude-code"],
  max_data_classification: "INTERNAL",
  evidence_refs: ["ev-1"],
  approval_history: [{ decision_id: "dec-1", decision_type: "HUMAN_PROMOTION", approved_by: "operator", approved_at: NOW }],
  revocation_conditions: ["regression"],
  ...over
});

const SOURCE = { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" };
const OWNER = "SKILL";

const ok = (over = {}) => composeManifest({ descriptor: descriptor(), grant: grant(), source: SOURCE, owner: OWNER, ...over });

const code = (fn) => {
  try { fn(); return "COMPOSED"; } catch (e) { return e.code ?? e.constructor.name; }
};

describe("composition — the positive arm", () => {
  it("produces a manifest the CONTRACT accepts, not one this test invented", () => {
    const manifest = ok();
    assert.deepEqual(
      validateContract("skillManifest", manifest),
      { kind: "skillManifest", valid: true },
      "the composed manifest must satisfy contracts/skill-manifest.schema.json"
    );
  });

  it("takes each field from the side that owns it", () => {
    const m = ok();
    // grant side
    assert.deepEqual(m.project_scopes, ["prj_secb_local"]);
    assert.equal(m.max_data_classification, "INTERNAL");
    assert.equal(m.status, "PUBLISHED");
    // descriptor side
    assert.equal(m.name, "architecture-decision-record");
    assert.equal(m.purpose, "Produce a bounded architecture decision record");
    // neither side
    assert.equal(m.owner, OWNER);
    assert.deepEqual(m.source, SOURCE);
  });

  it("copies rather than aliases, so a caller cannot mutate the grant through the manifest", () => {
    const g = grant();
    const m = composeManifest({ descriptor: descriptor(), grant: g, source: SOURCE, owner: OWNER });
    m.project_scopes.push("prj_someone_else");
    assert.deepEqual(g.project_scopes, ["prj_secb_local"], "the grant must not be reachable through the output");
  });
});

describe("composition — the author may not supply what the grant decides", () => {
  for (const field of GRANT_ONLY_FIELDS) {
    it(`refuses a descriptor carrying ${field}`, () => {
      assert.equal(
        code(() => ok({ descriptor: descriptor({ [field]: "anything" }) })),
        "DENY_AUTHOR_SUPPLIED_GRANT"
      );
    });
  }

  it("the same descriptor without the overreach composes", () => {
    // Control. Without it the seven denials above prove only that something is
    // broken, not that the overreach is what was caught.
    assert.equal(code(() => ok()), "COMPOSED");
  });
});

describe("composition — identity must agree across the two halves", () => {
  it("refuses a grant for a different skill, and composes when they match", () => {
    assert.equal(code(() => ok({ grant: grant({ skill_id: "SECB-OTHER-001" }) })), "DENY_IDENTITY_MISMATCH");
    assert.equal(code(() => ok({ grant: grant({ version: "9.9.9" }) })), "DENY_VERSION_MISMATCH");
    assert.equal(code(() => ok()), "COMPOSED");
  });
});

describe("composition — the two unaccounted fields have no defaults", () => {
  it("refuses a missing owner rather than inventing one", () => {
    assert.equal(code(() => ok({ owner: undefined })), "DENY_NO_OWNER");
    assert.equal(code(() => ok({ owner: "   " })), "DENY_NO_OWNER");
    assert.equal(code(() => ok({ owner: "SKILL" })), "COMPOSED");
  });

  it("refuses a source that does not bind the promoted bytes", () => {
    assert.equal(code(() => ok({ source: undefined })), "DENY_NO_SOURCE");
    assert.equal(code(() => ok({ source: { repository: "SecB" } })), "DENY_NO_SOURCE");
    assert.equal(code(() => ok({ source: { ...SOURCE, commit_sha: undefined } })), "DENY_NO_SOURCE");
    assert.equal(code(() => ok({ source: SOURCE })), "COMPOSED");
  });
});

describe("composition — an incomplete half is refused, not completed", () => {
  it("names which grant fields are missing", () => {
    try {
      ok({ grant: grant({ evidence_refs: undefined, revocation_conditions: undefined }) });
      assert.fail("expected a refusal");
    } catch (e) {
      assert.equal(e.code, "DENY_INCOMPLETE_GRANT");
      assert.deepEqual(e.detail.fields.sort(), ["evidence_refs", "revocation_conditions"]);
    }
  });

  it("refuses a descriptor with no name and no purpose", () => {
    assert.equal(code(() => ok({ descriptor: descriptor({ display_name: undefined, package_name: undefined }) })), "DENY_NO_NAME");
    assert.equal(code(() => ok({ descriptor: descriptor({ purpose: "" }) })), "DENY_NO_PURPOSE");
  });

  it("falls back from display_name to package_name, and says so by composing", () => {
    const m = ok({ descriptor: descriptor({ display_name: undefined }) });
    assert.equal(m.name, "architecture-decision-record");
  });

  it("refuses a missing half outright", () => {
    assert.equal(code(() => composeManifest({ grant: grant(), source: SOURCE, owner: OWNER })), "DENY_NO_DESCRIPTOR");
    assert.equal(code(() => composeManifest({ descriptor: descriptor(), source: SOURCE, owner: OWNER })), "DENY_NO_GRANT");
    assert.equal(code(() => composeManifest()), "DENY_NO_DESCRIPTOR");
  });
});

describe("composition — it composes, and does not register", () => {
  it("exports no path to the resolver", async () => {
    // The refusal in SECB-ASSURANCE-SKILLSHUB-WIRING-001 is a property of this
    // module, not a promise about it. Pin it.
    const mod = await import("../src/skills/manifest-composition.mjs");
    const surface = Object.keys(mod).sort();
    assert.deepEqual(surface, ["CompositionError", "GRANT_ONLY_FIELDS", "composeManifest"],
      "composing must not grow a register/resolve surface without this test noticing");
  });
});
