/**
 * WP-SK-01 acceptance suite — ADR-0013 trust-tier split.
 *
 * Each test names the acceptance criterion it proves. AC-09 (validate + suite
 * green) and AC-10 (registry stays empty) are proven elsewhere: AC-09 by the
 * producer-run checks recorded as evidence, AC-10 by AC-SKILLS-HUB-11 and the
 * assertion below that no non-test caller of registerSkill exists.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import * as mapperModule from "../src/skills/package-descriptor-mapper.mjs";
const { mapPackageRoot } = mapperModule;

const DESCRIPTOR = JSON.parse(readFileSync(resolve(process.cwd(), "contracts/skill-package-descriptor.schema.json"), "utf8"));
const GRANT = JSON.parse(readFileSync(resolve(process.cwd(), "contracts/skill-grant-record.schema.json"), "utf8"));

function validDescriptor(overrides = {}) {
  return {
    skill_id: "SECB-ARCH-014",
    package_name: "security-threat-modeling",
    display_name: "Security and Agentic Threat Modeling",
    version: "0.1.0",
    purpose: "Performs system and agentic threat modeling.",
    risk_class: "R2",
    controls: { repository_mutation: "prohibited", secret_handling: "prohibited" },
    ...overrides
  };
}

describe("WP-SK-01 / AC-01,02,03,07 — contract shape", () => {
  it("AC-01: the descriptor is a closed draft 2020-12 object with a non-empty required set", () => {
    assert.equal(DESCRIPTOR.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(DESCRIPTOR.type, "object");
    assert.equal(DESCRIPTOR.additionalProperties, false);
    assert.ok(DESCRIPTOR.required.length > 0);
    assert.doesNotThrow(() => validateContract("skillPackageDescriptor", validDescriptor()));
  });

  it("AC-02: the two required sets are disjoint apart from the join keys", () => {
    assert.equal(GRANT.additionalProperties, false);
    const shared = DESCRIPTOR.required.filter((f) => GRANT.required.includes(f)).sort();
    assert.deepEqual(shared, ["skill_id", "version"], "only skill_id and version may appear in both");

    // The granted tier must not require anything an author could assert.
    for (const authored of ["package_name", "display_name", "purpose", "risk_class", "controls", "owner"]) {
      assert.ok(!GRANT.required.includes(authored), `${authored} is authored and must not be required of a grant`);
    }
  });

  it("AC-03: package_name is patterned and display_name is separate free text", () => {
    assert.equal(DESCRIPTOR.properties.package_name.pattern, "^[a-z0-9-]{1,64}$");
    assert.equal(DESCRIPTOR.properties.display_name.pattern, undefined);
    assert.ok(DESCRIPTOR.required.includes("package_name") && DESCRIPTOR.required.includes("display_name"));

    assert.throws(() => validateContract("skillPackageDescriptor", validDescriptor({ package_name: "Security Threat Modeling" })));
    assert.doesNotThrow(() => validateContract("skillPackageDescriptor", validDescriptor({ display_name: "Security Threat Modeling" })));
  });

  it("AC-07: mutation_class is absent from both contracts", () => {
    assert.equal(DESCRIPTOR.properties.mutation_class, undefined);
    assert.equal(GRANT.properties.mutation_class, undefined);
    assert.equal(DESCRIPTOR.properties.controls.properties.mutation_class, undefined);
  });

  it("the descriptor carries no scope, status, or approval field", () => {
    for (const granted of ["status", "project_scopes", "supported_runtimes", "max_data_classification", "evidence_refs", "approval_history", "revocation_conditions"]) {
      assert.equal(DESCRIPTOR.properties[granted], undefined, `${granted} is a grant and must not exist on the descriptor`);
    }
  });

  it("the grant record's status enum carries the RESTRICTED_PUBLICATION stage", () => {
    assert.ok(GRANT.properties.status.enum.includes("RESTRICTED_PUBLICATION"),
      "SECB-SKILL-001 requires restricted publication as a lifecycle stage");
  });
});

describe("WP-SK-01 / AC-06 — a grant cannot be author-supplied", () => {
  it("AC-06: a descriptor carrying a grant field is rejected, not ignored", () => {
    for (const granted of ["project_scopes", "max_data_classification", "approval_history", "status"]) {
      assert.throws(
        () => validateContract("skillPackageDescriptor", validDescriptor({ [granted]: ["smuggled"] })),
        `a descriptor declaring ${granted} must be rejected`
      );
    }
  });

  it("a grant record carrying an authored field is rejected", () => {
    const grant = {
      skill_id: "SECB-ARCH-014",
      version: "0.1.0",
      status: "CANDIDATE",
      project_scopes: ["prj_secb_local"],
      supported_runtimes: ["claude-code"],
      max_data_classification: "INTERNAL",
      evidence_refs: [],
      approval_history: [],
      revocation_conditions: []
    };
    assert.doesNotThrow(() => validateContract("skillGrantRecord", grant));
    assert.throws(() => validateContract("skillGrantRecord", { ...grant, purpose: "smuggled" }));
  });
});

describe("WP-SK-01 / AC-04 — the corpus maps without fabrication", () => {
  const SKILLS_ROOT = resolve(process.cwd(), ".agents/skills");
  // Counted from DISK, not from the mapper's own output. The previous version
  // derived the 22 from the result set, so a package the mapper silently
  // skipped could not affect it - demonstrated by adding a 23rd package that
  // the suite did not notice.
  const onDisk = readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(SKILLS_ROOT, e.name, "manifest.yaml")))
    .map((e) => e.name)
    .sort();
  const mapped = mapPackageRoot(".agents/skills", { repository: "SecB", commitSha: "d6610a7" });

  it("AC-04: every manifest-carrying package on disk maps to a valid descriptor", () => {
    assert.equal(onDisk.length, 23, "the corpus is expected to hold 23 manifest-carrying packages");
    assert.equal(mapped.length, readdirSync(SKILLS_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).length,
      "the mapper must emit one entry per package directory, never skip one");

    const withManifest = mapped.filter((m) => m.hasManifest).map((m) => m.packageName).sort();
    assert.deepEqual(withManifest, onDisk, "every manifest on disk must appear in the mapper output");

    for (const entry of mapped.filter((m) => m.hasManifest)) {
      assert.ok(entry.descriptor, `${entry.packageName} produced no descriptor: ${entry.findings.join("; ")}`);
      assert.doesNotThrow(
        () => validateContract("skillPackageDescriptor", entry.descriptor),
        `${entry.packageName} descriptor failed validation`
      );
    }
  });

  it("a package with no manifest produces a finding rather than being skipped", () => {
    // The subject is BUILT. This asserted that exactly 3 packages had no manifest
    // and named graphify, secb-project-registry and worktree -- so the property
    // "an ungoverned package is reported, not skipped" was only tested while the
    // corpus happened to contain ungoverned packages. Moving those three to
    // .agents/tool-notes/, where they belonged, would have left the property
    // silently untested at 0 == 0 had the count not been asserted.
    const root = mkdtempSync(join(tmpdir(), "secb-mapper-ungoverned-"));
    try {
      const dir = join(root, "fixture-ungoverned");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), ["# fixture-ungoverned", "", "No manifest.", ""].join(String.fromCharCode(10)));

      const out = mapPackageRoot(root, { repository: "SecB", commitSha: "fixture" });
      assert.equal(out.length, 1, "the package must be mapped, not skipped for lacking a manifest");
      assert.equal(out[0].packageName, "fixture-ungoverned");
      assert.equal(out[0].hasManifest, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the real corpus now carries no ungoverned package", () => {
    // The other half of the pin above, kept as its own claim: the corpus is
    // expected to be fully governed, and a package appearing here without a
    // manifest is the signal that something ungoverned was added to
    // .agents/skills/ again.
    assert.deepEqual(mapped.filter((m) => !m.hasManifest).map((m) => m.packageName), []);
  });

  it("owner and licence are reported as findings, never invented", () => {
    for (const entry of mapped.filter((m) => m.descriptor)) {
      assert.equal(entry.descriptor.owner, undefined, `${entry.packageName}: owner must not be fabricated`);
      assert.equal(entry.descriptor.source?.licence, undefined, `${entry.packageName}: licence must not be fabricated`);
      assert.ok(
        entry.findings.some((f) => f.startsWith("owner is absent")),
        `${entry.packageName}: a missing owner must be recorded as a finding`
      );
    }
  });

  it("no manifest section is silently lost in translation", () => {
    // A lossy mapping always validates, because dropping an optional field is
    // legal. The `\Z` bug voided `evaluation` on 22 of 22 descriptors with the
    // suite green, so validation cannot be the control here.
    // FIELD-granular. A section-level assertion is a regression test for the one
    // \Z bug, not a control against the class: dropping evaluation.suite,
    // evaluation.cross_harness or roles.prohibited_final_authority individually
    // left the section object present and the suite green - and the last of
    // those is the exact field the \Z bug discarded.
    const requiredPaths = [
      ["evaluation", "suite"],
      ["evaluation", "cross_harness"],
      ["roles", "allowed"],
      ["roles", "prohibited_final_authority"],
      ["inputs", "required"],
      ["outputs", "required"]
    ];
    for (const entry of mapped.filter((m) => m.descriptor)) {
      for (const [section, key] of requiredPaths) {
        assert.ok(
          entry.descriptor[section]?.[key],
          `${entry.packageName}: ${section}.${key} did not carry into the descriptor`
        );
      }
      assert.equal(Object.keys(entry.descriptor.controls).length, 4, `${entry.packageName}: all four controls must carry`);
      assert.ok(entry.descriptor.authority_ceiling_cap, `${entry.packageName}: authority ceiling must carry`);
      assert.ok(!entry.findings.some((f) => f.includes("did not carry")), `${entry.packageName}: ${entry.findings.join("; ")}`);
    }
  });

  it("a package impersonating another identity is blocked, not warned", () => {
    const { mapPackageToDescriptor } = mapperModule;
    const result = mapPackageToDescriptor({
      directoryName: "impostor",
      manifestText: [
        "skill_id: SECB-ARCH-014",
        "name: security-threat-modeling",
        "version: 0.1.0",
        "classification:",
        "  risk_class: R2",
        "controls:",
        "  repository_mutation: prohibited",
        "  secret_handling: prohibited"
      ].join("\n"),
      skillMdText: ["---", "name: impostor", "description: d", "---", "", "# x"].join("\n")
    });
    assert.equal(result.descriptor, null, "an impersonating manifest must not yield a descriptor");
    assert.ok(result.findings.some((f) => f.includes("does not match directory")));
  });

  it("every mapped package_name equals its directory", () => {
    for (const entry of mapped.filter((m) => m.descriptor)) {
      assert.equal(entry.descriptor.package_name, entry.packageName);
    }
  });
});

describe("WP-SK-01 / fix round 2 — controls that must not be silently deletable", () => {
  // Round 5 found that the three contract constraints added in the previous fix
  // round were enforced by the schema and by NOTHING ELSE: deleting the skill_id
  // pattern, the PUBLISHED allOf, or work_package_id from required each left
  // validate at exit 0 with the whole suite green. A constraint no test defends
  // is one edit from gone.
  const grant = (o = {}) => ({
    skill_id: "SECB-ARCH-014",
    version: "0.1.0",
    status: "CANDIDATE",
    project_scopes: ["prj_secb_local"],
    supported_runtimes: ["claude-code"],
    max_data_classification: "INTERNAL",
    evidence_refs: [],
    approval_history: [],
    revocation_conditions: [],
    ...o
  });
  const approval = {
    decision_id: "dec_1",
    decision_type: "HUMAN_PROMOTION",
    approved_by: "human-gov",
    approved_at: "2026-08-02T00:00:00Z",
    work_package_id: "WP-SK-01"
  };

  it("a PUBLISHED grant must carry evidence and approval history", () => {
    assert.doesNotThrow(() => validateContract("skillGrantRecord",
      grant({ status: "PUBLISHED", evidence_refs: ["ev1"], approval_history: [approval] })));
    assert.throws(() => validateContract("skillGrantRecord",
      grant({ status: "PUBLISHED", evidence_refs: [], approval_history: [approval] })));
    assert.throws(() => validateContract("skillGrantRecord",
      grant({ status: "PUBLISHED", evidence_refs: ["ev1"], approval_history: [] })));
  });

  it("a RESTRICTED_PUBLICATION grant must carry evidence and approval history", () => {
    // SECB-SKILL-001 makes restricted publication a publication stage. Gating
    // only PUBLISHED let the stage the schema itself calls required be reached
    // with zero evidence.
    assert.throws(() => validateContract("skillGrantRecord",
      grant({ status: "RESTRICTED_PUBLICATION", evidence_refs: [], approval_history: [] })));
    assert.doesNotThrow(() => validateContract("skillGrantRecord",
      grant({ status: "RESTRICTED_PUBLICATION", evidence_refs: ["ev1"], approval_history: [approval] })));
  });

  it("every approval entry must bind a work package", () => {
    const { work_package_id, ...noWp } = approval;
    assert.throws(() => validateContract("skillGrantRecord",
      grant({ status: "PUBLISHED", evidence_refs: ["ev1"], approval_history: [noWp] })));
  });

  it("skill_id charset is constrained on both tiers", () => {
    for (const bad of ["SECB-A@9.9.9", " ", "a b", "-lead", ".lead"]) {
      assert.throws(() => validateContract("skillGrantRecord", grant({ skill_id: bad })), `grant accepted "${bad}"`);
      assert.throws(() => validateContract("skillPackageDescriptor", validDescriptor({ skill_id: bad })), `descriptor accepted "${bad}"`);
    }
    assert.doesNotThrow(() => validateContract("skillGrantRecord", grant({ skill_id: "SECB-ARCH-014" })));
  });

  it("the content digest lives on the granted tier only", () => {
    assert.equal(DESCRIPTOR.properties.source.properties.content_digest, undefined);
    assert.ok(GRANT.properties.source_content_digest, "the promotion service records the digest");
  });
});

describe("WP-SK-01 / AC-10 — the registry gate holds", () => {
  it("AC-10: no non-test source calls registerSkill", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".mjs")) {
          const text = readFileSync(full, "utf8");
          // The definition itself lives in skill-resolver.mjs; a CALL is what matters.
          if (/\.registerSkill\s*\(/.test(text)) offenders.push(full);
        }
      }
    };
    for (const dir of ["src", "tools"]) {
      if (existsSync(resolve(process.cwd(), dir))) walk(resolve(process.cwd(), dir));
    }
    assert.deepEqual(offenders, [], `registry population is gated until Phase 5; found caller(s): ${offenders.join(", ")}`);
  });
});
