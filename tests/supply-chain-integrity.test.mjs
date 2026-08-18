// The dependency surface is bound to exact versions, and the binding covers what
// actually LOADS — not what the manifest declares.
//
// WORK PACKAGE (Phase E, recorded here)
//
//   Objective    Bind evidence to the dependency tree that produced it.
//   Problem      Both runtime dependencies are declared as semver RANGES —
//                `ajv ^8.20.0`, `ajv-formats ^3.0.1` — and nothing verified that
//                what runs is what was verified. `npm install` on a later day
//                resolves a range to a newer version, and the whole suite would
//                then be evidence about a different tree. Nothing in tests/ or
//                tools/ referenced package-lock.json or `npm ci` at all.
//   Why it bites `ajv` validates EVERY contract in SecB. Contract validation is
//                what the evidence model rests on, so a silently different ajv
//                changes the meaning of every downstream verification result.
//                This is §5.3 exact-revision binding, at the dependency layer.
//   Scope        tests/ only.
//   Exclusions   package.json is NOT edited. Nine test files byte-pin it, and
//                re-pinning tamper detection to satisfy my own change is the trap
//                this repository's rules forbid. The ranges stay; what changes is
//                that a drifting resolution now fails loudly.
//   Authority    AMD-002 §1 pre-authorized path. Adds a constraint, removes none.
//   Completion   Locked versions pinned by NAME, integrity present for every
//                package, and the RUNTIME-loaded version asserted equal to the
//                locked one.
//
// WHAT THE INTEGRITY PINS DO AND DO NOT PROVE
//
// The hashes below were read from this repository's own package-lock.json. They
// do not establish that the packages were good at that moment — nothing local
// can. What they do is make later tampering loud: an edited lockfile pointing at
// a different tarball keeps its version string and changes its hash, and a
// version pin alone would not see it. Forward tamper-evidence, not provenance.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = (rel) => JSON.parse(readFileSync(resolve(REPO, rel), "utf8"));

/**
 * The exact tree this repository's evidence is about.
 *
 * UPDATE DELIBERATELY, IN THE SAME COMMIT AS THE UPGRADE. A diff here is the
 * record that the dependency tree moved, and every verification result produced
 * before it was about a different tree. If updating this feels like clearing a
 * nuisance failure, that is the pin working.
 */
const PINNED = Object.freeze({
  ajv: {
    version: "8.20.0",
    integrity: "sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA=="
  },
  "ajv-formats": {
    version: "3.0.1",
    integrity: "sha512-8iUql50EUR+uUcdRQ3HDqa6EVyo3docL8g5WJ3FNcWmu62IbkGUue/pEyLBW8VGKKucTPgqeks4fIU1DA4yowQ=="
  },
  "fast-deep-equal": {
    version: "3.1.3",
    integrity: "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q=="
  },
  "fast-uri": {
    version: "3.1.4",
    integrity: "sha512-8JnbkQ4juDyvYs4mgFGQqg4yCYtFDtUtmp2QIQq11ZZe5CFQ5wcqm1rqDgAh/QdMySuBnPzMUiJUNZG5N/AiQw=="
  },
  "json-schema-traverse": {
    version: "1.0.0",
    integrity: "sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug=="
  },
  "require-from-string": {
    version: "2.0.2",
    integrity: "sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw=="
  }
});

/** Every package the lockfile installs, keyed by bare name. */
function lockedPackages() {
  const lock = json("package-lock.json");
  const out = {};
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith("node_modules/")) continue;
    out[key.slice("node_modules/".length)] = entry;
  }
  return out;
}

test("the locked tree is exactly the pinned tree, named rather than counted", () => {
  const locked = lockedPackages();
  // Named, not counted: a count survives one package being swapped for another,
  // which is the substitution a supply-chain pin exists to see.
  assert.deepEqual(
    Object.keys(locked).sort(),
    Object.keys(PINNED).sort(),
    "the installed package set changed; record the change deliberately"
  );
  for (const [name, expected] of Object.entries(PINNED)) {
    assert.equal(locked[name].version, expected.version, `${name}: locked version moved`);
    assert.equal(locked[name].integrity, expected.integrity, `${name}: integrity hash moved`);
  }
});

test("every locked package carries an integrity hash", () => {
  const missing = Object.entries(lockedPackages())
    .filter(([, entry]) => typeof entry.integrity !== "string" || !entry.integrity.startsWith("sha"))
    .map(([name]) => name);
  assert.deepEqual(missing, [], "a package with no subresource integrity can be substituted at install time");
});

test("the RUNTIME-loaded version is the locked version, not merely the declared range", () => {
  // The assertion that matters. package.json says `^8.20.0`, which permits any
  // 8.x. What this checks is the version the process actually resolves through
  // src/contracts/lazy-ajv.mjs's createRequire — evidence about what ran, not
  // about what was written down.
  const req = createRequire(resolve(REPO, "package.json"));
  for (const name of ["ajv", "ajv-formats"]) {
    if (!existsSync(resolve(REPO, "node_modules", name, "package.json"))) {
      assert.fail(`${name} is not installed; the suite would be evidence about an absent dependency`);
    }
    const loaded = req(`${name}/package.json`).version;
    assert.equal(
      loaded,
      PINNED[name].version,
      `${name}: the loaded version is ${loaded} but the lock pins ${PINNED[name].version}. ` +
        "Every verification result in this repository is about the loaded tree."
    );
  }
});

test("the declared ranges still admit the pinned versions", () => {
  // A range that no longer admits its locked version means package.json and the
  // lockfile disagree, and `npm install` would resolve away from the pin on the
  // next clean checkout. Checked by major-version prefix rather than a semver
  // implementation, because adding a dependency to test the dependency surface
  // would be its own defect. The limitation is stated rather than hidden: this
  // catches a major-version divergence, not every semver subtlety.
  const declared = json("package.json").dependencies ?? {};
  for (const [name, range] of Object.entries(declared)) {
    // `^[\^~]?(\d+)\.` — one optional range operator, then the major. My first
    // attempt used `[^~]*`, a greedy negated class that backtracked into the
    // MINOR segment and read `^8.20.0` as major 20. It failed at baseline, which
    // is the only reason it was caught.
    const major = /^[\^~]?(\d+)\./.exec(range)?.[1];
    const lockedMajor = PINNED[name].version.split(".")[0];
    assert.equal(major, lockedMajor, `${name}: declared range ${range} and locked ${PINNED[name].version} disagree`);
  }
});

test("no dependency is vendored into the repository", () => {
  const tracked = execFileSync("git", ["ls-files", "--", "node_modules"], { cwd: REPO, encoding: "utf8" }).trim();
  assert.equal(tracked, "", "node_modules is tracked; the lockfile would no longer be the source of truth");
});

test("the dependency manifest and lockfile are both inventoried", () => {
  // They are the artifacts every other verification result depends on. If they
  // fall out of MANIFEST.json they stop being covered by the repository's own
  // completeness gate.
  const manifest = json("MANIFEST.json").files;
  for (const file of ["package.json", "package-lock.json"]) {
    assert.ok(manifest.includes(file), `${file} is not in MANIFEST.json`);
  }
});
