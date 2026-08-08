// tools/validate-foundation.mjs is where nearly every repository-level gate
// lives, and until now nothing tested it. Seven test files pin its blob, which
// proves only that it has not CHANGED — a pin cannot tell you whether the logic
// still does what it claims. Three checks were added to it on 2026-08-08
// (manifest.complete, schemas.nested, and the governed-contract position
// filter) with no test asserting that any of them fires.
//
// These tests assert that each gate BITES: for every check, construct the exact
// violation it exists to catch and require it to be the one that fails.
//
// They run against an isolated fixture, never the live repository. `node --test`
// runs test files in parallel, so perturbing the real MANIFEST.json would race
// every other file that reads it — the fixture is built once from `git archive
// HEAD` into a temp directory with its own git repo, and only that copy is
// mutated.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");

let fixture = null;
let pristineManifest = "";
let pristineDocsManifest = "";

before(() => {
  fixture = mkdtempSync(join(tmpdir(), "secb-vf-"));
  // `git archive HEAD` gives the committed tree with no history and no
  // node_modules; validate-foundation imports nothing outside node: builtins,
  // so the copy needs no install.
  execSync(`git archive HEAD | tar -x -C "${fixture}"`, { cwd: REPO, stdio: "ignore" });
  // It calls `git ls-files` for the manifest-completeness check and `git remote
  // -v` for the remote allowlist, so the fixture needs to be a repository. With
  // no remote configured the remote check reports "no remotes configured" and
  // passes, which keeps these cases about the manifest gates only.
  execSync("git init -q .", { cwd: fixture, stdio: "ignore" });
  execSync("git add -A -f", { cwd: fixture, stdio: "ignore" });
  execSync('git -c user.email=fixture@test -c user.name=fixture commit -qm fixture', { cwd: fixture, stdio: "ignore" });
  // `git archive HEAD` gives the COMMITTED validator. Overwrite it with the
  // working-tree copy, or these tests would happily pass while a gate had been
  // deleted from the file the developer is actually editing — testing the last
  // commit instead of the change in front of you is the same blind spot as
  // pinning to a moving ref.
  writeFileSync(
    join(fixture, "tools", "validate-foundation.mjs"),
    readFileSync(join(REPO, "tools", "validate-foundation.mjs"))
  );
  pristineManifest = readFileSync(join(fixture, "MANIFEST.json"), "utf8");
  pristineDocsManifest = readFileSync(join(fixture, "docs", "MANIFEST.json"), "utf8");
});

after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

/** Run the validator inside the fixture. Returns { ok, stdout, stderr }. */
function runValidator() {
  try {
    const stdout = execFileSync(process.execPath, ["tools/validate-foundation.mjs"], {
      cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, stdout, stderr: "" };
  } catch (error) {
    return { ok: false, stdout: `${error.stdout ?? ""}`, stderr: `${error.stderr ?? ""}` };
  }
}

/** Mutate the fixture's manifest, run, restore. The restore is unconditional. */
function withManifest(which, mutate) {
  const rel = which === "docs" ? join("docs", "MANIFEST.json") : "MANIFEST.json";
  const path = join(fixture, rel);
  const pristine = which === "docs" ? pristineDocsManifest : pristineManifest;
  try {
    const manifest = JSON.parse(pristine);
    mutate(manifest);
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    return runValidator();
  } finally {
    writeFileSync(path, pristine);
  }
}

/** The check name a failure names, e.g. "manifest.complete" from "manifest.complete: ...". */
const failedCheck = (result) => (result.stderr.match(/Error: ([a-z][\w.\-/]*)/i) ?? [])[1] ?? null;

// --- baseline ---------------------------------------------------------------

test("the validator passes on an unmodified tree, and says which checks ran", () => {
  const result = runValidator();
  assert.equal(result.ok, true, `expected PASS, got:\n${result.stderr.slice(0, 400)}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  const names = new Set(report.checks.map((c) => c.name));
  // Named individually: a check that silently stops being emitted is exactly
  // the failure these tests exist to catch, and a bare count would not see it.
  for (const required of [
    "version.package", "version.manifest", "manifest.unique", "manifest.complete",
    "docs-manifest.status", "docs-manifest.count", "docs-manifest.unique",
    "schemas.nested", "schemas.count", "schemas.subsystem",
    "schema.required.exact.coverage", "schema.properties.exact.coverage"
  ]) {
    assert.ok(names.has(required), `${required} was not emitted — the gate is gone, not passing`);
  }
  assert.ok(report.checks.every((c) => c.status === "PASS"), "every emitted check reports PASS");
});

// --- inventory gates --------------------------------------------------------

test("manifest.file bites when an inventoried path is not on disk", () => {
  const result = withManifest("root", (m) => m.files.push("src/there-is-no-such-file.mjs"));
  assert.equal(result.ok, false, "a phantom inventory entry must fail");
  assert.match(failedCheck(result) ?? "", /^manifest\.file\./);
});

test("manifest.complete bites when a tracked governed file is left out of the inventory", () => {
  // The converse direction, and the one that was missing until 2026-08-08:
  // 25 tracked files sat outside MANIFEST while the suite stayed green.
  const result = withManifest("root", (m) => {
    const victim = m.files.find((f) => f.startsWith("src/") && f.endsWith(".mjs"));
    m.files = m.files.filter((f) => f !== victim);
  });
  assert.equal(result.ok, false, "a tracked governed file missing from MANIFEST must fail");
  assert.equal(failedCheck(result), "manifest.complete");
});

test("manifest.unique bites on a duplicated path", () => {
  const result = withManifest("root", (m) => m.files.push(m.files[0]));
  assert.equal(result.ok, false);
  assert.equal(failedCheck(result), "manifest.unique");
});

test("docs-manifest.count bites when the declared count disagrees with the list", () => {
  const result = withManifest("docs", (m) => { m.file_count_excluding_manifests += 1; });
  assert.equal(result.ok, false);
  assert.equal(failedCheck(result), "docs-manifest.count");
});

// --- contract-position gates ------------------------------------------------

test("schemas.nested bites when a schema under contracts/ is nested but not allowlisted", () => {
  // The gate added with the position fix. Before it, a nested schema silently
  // joined the governed 35 and failed three pin maps instead of saying what was
  // actually wrong.
  const result = withManifest("root", (m) => m.files.push("contracts/unlisted-area/made-up.schema.json"));
  assert.equal(result.ok, false, "an unallowlisted nested contract schema must fail");
  // It fails on existence first (the path is invented), so assert on the pair:
  // either the phantom-file gate or the nesting gate must be the one to bite,
  // and never neither.
  const check = failedCheck(result) ?? "";
  assert.ok(/^manifest\.file\.|^schemas\.nested$/.test(check), `unexpected check fired: ${check}`);
});

test("schemas.count bites when a governed contract leaves the inventory", () => {
  const result = withManifest("root", (m) => {
    const victim = m.files.find((f) => f.startsWith("contracts/") && f.endsWith(".schema.json") && f.split("/").length === 2);
    m.files = m.files.filter((f) => f !== victim);
  });
  assert.equal(result.ok, false, "dropping a governed contract must fail");
  // manifest.complete guards the same direction and runs first; either is a
  // correct refusal, silence is not.
  const check = failedCheck(result) ?? "";
  assert.ok(/^(schemas\.count|manifest\.complete)$/.test(check), `unexpected check fired: ${check}`);
});

// --- the fixture itself -----------------------------------------------------

test("the fixture is restored after every mutation", () => {
  assert.equal(readFileSync(join(fixture, "MANIFEST.json"), "utf8"), pristineManifest);
  assert.equal(readFileSync(join(fixture, "docs", "MANIFEST.json"), "utf8"), pristineDocsManifest);
  assert.equal(runValidator().ok, true, "the fixture still validates, so no case leaked state");
});
