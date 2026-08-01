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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import { mapPackageRoot } from "../src/skills/package-descriptor-mapper.mjs";

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
  const mapped = mapPackageRoot(".agents/skills", { repository: "SecB", commitSha: "d6610a7" });

  it("AC-04: all 22 manifest-carrying packages map to a valid descriptor", () => {
    const withManifest = mapped.filter((m) => !m.findings.includes("package carries no manifest.yaml, so it has no governed identity"));
    assert.equal(withManifest.length, 22, "exactly 22 packages carry a manifest");

    for (const entry of withManifest) {
      assert.ok(entry.descriptor, `${entry.packageName} produced no descriptor: ${entry.findings.join("; ")}`);
      assert.doesNotThrow(
        () => validateContract("skillPackageDescriptor", entry.descriptor),
        `${entry.packageName} descriptor failed validation`
      );
    }
  });

  it("the 3 packages with no manifest produce a finding rather than being skipped", () => {
    const withoutManifest = mapped.filter((m) => m.descriptor === null && m.findings.some((f) => f.includes("no manifest.yaml")));
    assert.equal(withoutManifest.length, 3);
    assert.deepEqual(
      withoutManifest.map((m) => m.packageName).sort(),
      ["graphify", "secb-project-registry", "worktree"]
    );
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

  it("every mapped package_name equals its directory", () => {
    for (const entry of mapped.filter((m) => m.descriptor)) {
      assert.equal(entry.descriptor.package_name, entry.packageName);
    }
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
