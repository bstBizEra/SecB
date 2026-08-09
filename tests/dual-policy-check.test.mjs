// dual-policy-check answers one question: did this branch edit a guard until the
// guard accepted it? A test for that tool has to build the situation, because
// the situation is exactly the one a green suite cannot see.
//
// The fixture is a synthetic two-commit repository rather than an archive of
// this one. What is under test is the tool's REASONING about a base and a head,
// and a purpose-built repo states the scenarios in three lines each; running it
// against SecB's real history would test git more than it tests the tool.
//
// The tool resolves its repository root from its own file location, so the copy
// under test is placed inside the fixture. That is deliberate and mirrors
// validate-foundation.test.mjs: a fixture running a COMMITTED copy of the tool
// would stay green while the working-tree copy was being broken.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = "tools/dual-policy-check.mjs";

let fixture;

const git = (args, cwd = fixture) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });

function write(rel, body) {
  const abs = join(fixture, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

/** The guard under test in the fixture: src/thing.mjs must not touch the filesystem. */
const STRICT_GUARD = `import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
test("thing is pure", () => {
  const src = readFileSync(new URL("../src/thing.mjs", import.meta.url), "utf8");
  assert.equal(src.includes("node:fs"), false, "thing.mjs reached the filesystem");
});
`;

// Same guard with the assertion removed — the rule moved, nothing else.
const RELAXED_GUARD = STRICT_GUARD.replace(/\n  assert\.equal\(src\.includes[^\n]*\n/, "\n");

function runTool(base = "main") {
  try {
    const stdout = execFileSync(process.execPath, [join(fixture, TOOL), base], {
      cwd: fixture,
      encoding: "utf8",
      stdio: "pipe"
    });
    return { code: 0, output: stdout };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

before(() => {
  fixture = mkdtempSync(join(tmpdir(), "secb-dpc-"));
  git(["init", "-q", "-b", "main", "."]);
  git(["config", "user.email", "fixture@local"]);
  git(["config", "user.name", "fixture"]);

  mkdirSync(join(fixture, "tools"), { recursive: true });
  copyFileSync(join(REPO, TOOL), join(fixture, TOOL));

  write("src/thing.mjs", "export const thing = 1;\n");
  write("tests/thing.test.mjs", STRICT_GUARD);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
});

after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

/** Reset the fixture to its base commit before each scenario. */
function reset() {
  git(["checkout", "-q", "main"]);
  git(["reset", "-q", "--hard", "main"]);
  git(["clean", "-qfd"]);
}

test("a branch that edits the guard until the guard accepts it is LOOSENED, and exits non-zero", () => {
  reset();
  git(["checkout", "-q", "-b", "loosen"]);
  write("src/thing.mjs", 'import { readFileSync } from "node:fs";\nexport const thing = 1;\n');
  write("tests/thing.test.mjs", RELAXED_GUARD);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "violate the rule and move the rule"]);

  // The scenario's whole point: the suite is green. Run WITHOUT
  // NODE_TEST_CONTEXT — inherited, this nested runner reports to the outer one,
  // prints nothing, and exits 0 whatever happened. That is the same distortion
  // the tool itself has to defend against, and it is asserted below.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const suite = execFileSync(process.execPath, ["--test", join(fixture, "tests/thing.test.mjs")], {
    cwd: fixture,
    encoding: "utf8",
    stdio: "pipe",
    env
  });
  assert.match(suite, /fail 0/, "the fixture must be green, or it proves nothing");

  const { code, output } = runTool();
  assert.equal(code, 1, "a loosened guard must fail the check");
  assert.match(output, /LOOSENED/);
  assert.match(output, /tests\/thing\.test\.mjs/);
});

test("a branch that only tightens a guard is reported and does not fail", () => {
  reset();
  git(["checkout", "-q", "-b", "tighten"]);
  write(
    "tests/thing.test.mjs",
    STRICT_GUARD.replace(
      'assert.equal(src.includes("node:fs"), false',
      'assert.equal(src.includes("export"), false'
    )
  );
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "stricter rule the tree does not satisfy"]);

  const { code, output } = runTool();
  assert.equal(code, 0, "tightening is not a governance failure");
  assert.match(output, /TIGHTENED/);
});

test("changing a guard without changing what it accepts is UNCHANGED", () => {
  reset();
  git(["checkout", "-q", "-b", "cosmetic"]);
  write("tests/thing.test.mjs", `// a comment that changes nothing\n${STRICT_GUARD}`);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "comment only"]);

  const { code, output } = runTool();
  assert.equal(code, 0);
  assert.match(output, /UNCHANGED/);
});

test("deleting a guard is a loosening, because there is no new version to pass", () => {
  reset();
  git(["checkout", "-q", "-b", "delete"]);
  rmSync(join(fixture, "tests/thing.test.mjs"));
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "remove the guard"]);

  const { code, output } = runTool();
  assert.equal(code, 1);
  assert.match(output, /REMOVED/);
  assert.match(output, /LOOSENED/);
});

test("a branch that changes no guard is not a pass, it is nothing to evaluate", () => {
  reset();
  git(["checkout", "-q", "-b", "no-guard-change"]);
  write("src/thing.mjs", "export const thing = 2;\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "source only"]);

  const { code, output } = runTool();
  assert.equal(code, 0);
  assert.match(output, /no guard changed/i);
  // Worth pinning: silence here must not read as "guards were verified".
  assert.doesNotMatch(output, /No guard was loosened/);
});

test("the base copy is removed even when the check fails", () => {
  reset();
  git(["checkout", "-q", "-b", "cleanup"]);
  write("src/thing.mjs", 'import { readFileSync } from "node:fs";\nexport const thing = 1;\n');
  write("tests/thing.test.mjs", RELAXED_GUARD);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "loosen again"]);

  runTool();

  const strays = readdirSync(join(fixture, "tests")).filter((f) => f.startsWith("dual-policy-base-"));
  assert.deepEqual(strays, [], "a temp copy of the base guard was left in the tree");
});
