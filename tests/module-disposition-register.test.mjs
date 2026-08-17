// Every module that is not reachable has a reason, a decider, and a condition
// that ends the hold.
//
// WHY A REGISTER AND NOT A COUNT
//
// The reasons already existed and were scattered: some in a module's own header,
// some in AGENTS.md §4, some in a guard that names the module, one in an operator
// disposition that has been transcribed but not ratified. No single place read
// them together, so "22 modules are held" was a number nobody could audit — and a
// module could be added to the held set by nothing more than never being wired.
//
// This is the second half of the autonomous-operation goal: not "every module is
// live", which would destroy the distinction the gates exist to keep, but EVERY
// MODULE HAS A DISPOSITION.
//
// WHAT MAKES IT NOT GO STALE
//
// The held set is COMPUTED from the import graph on every run. The register only
// supplies reasons. So:
//
//   - a new module left unwired fails here until someone writes down why;
//   - a held module that becomes reachable fails here until its entry is removed,
//     which forces the removal to be a deliberate act rather than a leftover;
//   - the count is never written down, so it cannot disagree with the tree.
//
// That shape is deliberate. Two facts in this repository went stale as literals
// this month — a lens frame claiming "24 siblings" against a 23-package corpus,
// and an analysis claiming 99 of 122 reachable when it was 100. Both were true
// when written. Neither was derived.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HELD_BY = Object.freeze({
  OWN_HEADER: "the module's own header places adoption in separately-governed work",
  AGENTS_MD: "AGENTS.md skills registry amendment §4 — SEC/GOV-gated",
  GUARD: "a test asserts this module is absent from the public surface",
  UNRATIFIED: "an operator disposition exists but has not been ratified",
  WRONG_SURFACE: "src/index.mjs is not this module's wiring route",
  TEST_SUPPORT: "consumed by tests; the public surface is the wrong place for it"
});

/**
 * Why each unreachable module is unreachable.
 *
 * DO NOT ADD AN ENTRY TO SILENCE A FAILURE. A new line here records that a module
 * was delivered and deliberately not adopted, and it belongs in a commit that
 * says who decided and on what. `decider` is never an agent — that is asserted
 * below, because the whole point of a hold is that ending it is not the wiring
 * agent's call.
 */
const DISPOSITIONS = Object.freeze({
  "src/audit/corpus-expectation.mjs": {
    held_by: HELD_BY.TEST_SUPPORT,
    reason: "Carries EXPECTED_CORPUS, the tripwire that fires when the skill corpus changes unnoticed. Putting a test expectation on the public API would be a defect, not progress.",
    decider: "MOD-AUDIT owner",
    unblocks_when: "never, unless it stops being a test expectation"
  },
  "src/bridge/local-bridge-handshake-transcript.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "Its header defers to a later SEC-reviewed proof verifier and an atomic replay store that must consume it.",
    decider: "SEC review",
    unblocks_when: "the SEC-reviewed verifier and replay store exist"
  },
  "src/control/policy-decision-point.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "MOD-GOV S3 PDP facade, declared UNWIRED. Named in src/index.mjs as held alongside overlap-policy and write-set-policy.",
    decider: "GOV",
    unblocks_when: "MOD-GOV authorizes adoption of the decision point"
  },
  "src/gateway/ruflo-command-bridge.mjs": {
    held_by: HELD_BY.GUARD,
    reason: 'runtime-provider-plugin.test.mjs asserts publicApi.RufloCommandBridge === undefined: "legacy bridge must not be publicly exported". Superseded by RuntimeProviderPluginRegistry.',
    decider: "MOD-RUNTIME owner",
    unblocks_when: "never while the replacement stands; removal is the likelier end"
  },
  "src/ledger/integration-queue-ledger.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "MOD-INTEG S1, declared UNWIRED. integration-collision-forecast.test.mjs additionally asserts this file imports no forecast.",
    decider: "MOD-INTEG owner",
    unblocks_when: "the integration queue is adopted as a live path"
  },
  "src/ledger/skill-promotion-ledger.mjs": {
    held_by: HELD_BY.AGENTS_MD,
    reason: "Named in AGENTS.md §4 as an eventual runtime registry primitive, wired only under SEC/GOV. R3+.",
    decider: "SEC/GOV",
    unblocks_when: "the MOD-SKILL governed registry replaces the file-based bootstrap surface"
  },
  "src/ledger/skill-revocation-ledger.mjs": {
    held_by: HELD_BY.AGENTS_MD,
    reason: "Named in AGENTS.md §4 with the promotion ledger. R3+.",
    decider: "SEC/GOV",
    unblocks_when: "same decision as the promotion ledger"
  },
  "src/live/access-mode-policy.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "PURE + UNWIRED; adoption placed in separately-governed work (assessment §5 #5).",
    decider: "MOD-LIVE owner",
    unblocks_when: "the live event/replay path is adopted"
  },
  "src/live/event-family-policy.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "PURE + UNWIRED; same assessment clause as access-mode-policy.",
    decider: "MOD-LIVE owner",
    unblocks_when: "the live event/replay path is adopted"
  },
  "src/live/replay-assembler.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "PURE + UNWIRED, and its own test carries an absence guard naming it.",
    decider: "MOD-LIVE owner",
    unblocks_when: "the live event/replay path is adopted"
  },
  "src/ops/cadence-policy.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "MOD-OPS S3, PURE and UNWIRED; the scheduler path is later, separately-governed work.",
    decider: "MOD-OPS owner",
    unblocks_when: "the scheduler path is adopted"
  },
  "src/ops/kpi-registry.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "MOD-OPS S1, PURE and UNWIRED. Wiring slice 1 was refused over this module; all three MOD-OPS modules carry the same constraint.",
    decider: "MOD-OPS owner",
    unblocks_when: "the report/live path is adopted"
  },
  "src/ops/scorecard-assembler.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "MOD-OPS S2, PURE and UNWIRED; consumption by any report/live path is separately governed.",
    decider: "MOD-OPS owner",
    unblocks_when: "the report/live path is adopted"
  },
  "src/plugins/ollama-sec-scanner.mjs": {
    held_by: HELD_BY.WRONG_SURFACE,
    reason: "Plugin adapters reach this system through src/mcp/secb-mcp-server.mjs, not src/index.mjs. The two that ARE reached are imported there and named in index.mjs nowhere. Exporting this would invent a wiring pattern the repository does not use.",
    decider: "MCP server owner",
    unblocks_when: "the MCP server registers it, or it is retired"
  },
  "src/plugins/secb-graphify-adapter.mjs": {
    held_by: HELD_BY.WRONG_SURFACE,
    reason: "Same route as the other plugin adapters: MCP-server registration, not the library surface.",
    decider: "MCP server owner",
    unblocks_when: "the MCP server registers it, or it is retired"
  },
  "src/plugins/secb-rootly-importer.mjs": {
    held_by: HELD_BY.WRONG_SURFACE,
    reason: "Same route as the other plugin adapters.",
    decider: "MCP server owner",
    unblocks_when: "the MCP server registers it, or it is retired"
  },
  "src/plugins/secb-worktree-adapter.mjs": {
    held_by: HELD_BY.WRONG_SURFACE,
    reason: "Same route as the other plugin adapters.",
    decider: "MCP server owner",
    unblocks_when: "the MCP server registers it, or it is retired"
  },
  "src/registry/skill-candidate-registry.mjs": {
    held_by: HELD_BY.AGENTS_MD,
    reason: "Named in AGENTS.md §4 with the two skill ledgers as the eventual runtime registry, wired only under SEC/GOV.",
    decider: "SEC/GOV",
    unblocks_when: "the governed registry replaces the file-based bootstrap surface"
  },
  "src/security/redaction-policy.mjs": {
    held_by: HELD_BY.OWN_HEADER,
    reason: "PURE + UNWIRED evaluator; its header places the pre-storage enforcement path out of scope as separately SEC/GOV-gated work.",
    decider: "SEC/GOV",
    unblocks_when: "pre-storage redaction enforcement is authorized"
  },
  "src/self-pilot/fixtures.mjs": {
    held_by: HELD_BY.UNRATIFIED,
    reason: "P0-19 candidate scaffolding, explicitly NOT completion and NOT activation.",
    decider: "operator / GOV",
    unblocks_when: "P0-20 disposition 002 is ratified"
  },
  "src/self-pilot/read-only-self-pilot.mjs": {
    held_by: HELD_BY.UNRATIFIED,
    reason: 'P0-19 candidate. p0-20-operator-activation-disposition-002.md records the verdict "ACTIVATE (controlled)" at status OPERATOR_VERDICT_TRANSCRIBED_PENDING_RATIFICATION.',
    decider: "operator / GOV",
    unblocks_when: "P0-20 disposition 002 is ratified"
  },
  "src/ui/command-center-snapshot.mjs": {
    held_by: HELD_BY.GUARD,
    reason: "Its own test reads src/index.mjs as text and asserts this module's NAME does not appear in it — not its import, its name.",
    decider: "MOD-UI owner",
    unblocks_when: "MOD-UI lifts the guard; wiring alone cannot"
  }
});

/** Modules reachable from the library surface or any CLI entry point. */
function reachable() {
  const ls = (p) =>
    execFileSync("git", ["ls-files", "--", p], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  const seen = new Set();
  const queue = ["src/index.mjs", ...ls("tools/").filter((f) => f.endsWith(".mjs"))];
  while (queue.length > 0) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let source;
    try {
      source = readFileSync(resolve(REPO, rel), "utf8");
    } catch {
      continue;
    }
    // Any relative .mjs string literal is an edge. SecB loads through registry
    // tables as well as imports, so following `from "..."` alone undercounts —
    // it read 36% when the real figure was 52%.
    for (const m of source.matchAll(/["'](\.[^"']*\.mjs)["']/g)) {
      const next = relative(REPO, resolve(dirname(resolve(REPO, rel)), m[1])).replaceAll("\\", "/");
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

function heldModules() {
  const all = execFileSync("git", ["ls-files", "--", "src/"], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".mjs"));
  const live = reachable();
  return all.filter((f) => !live.has(f));
}

test("every unreachable module has a disposition", () => {
  const undisposed = heldModules().filter((m) => !(m in DISPOSITIONS));
  assert.deepEqual(
    undisposed,
    [],
    "These modules are delivered and unreachable with no recorded reason. A module is not held " +
      "by never having been wired — that is an accident, not a decision. Record who holds it, why, " +
      "who can end the hold, and what ends it."
  );
});

test("every disposition names a module that is still unreachable", () => {
  const held = new Set(heldModules());
  const stale = Object.keys(DISPOSITIONS).filter((m) => !held.has(m));
  assert.deepEqual(
    stale,
    [],
    "These have a disposition but are now reachable. Removing the entry is the deliberate act " +
      "that records the hold ending; leaving it makes the register describe a state that no longer exists."
  );
});

test("every disposition names a module that exists", () => {
  const tracked = new Set(
    execFileSync("git", ["ls-files", "--", "src/"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean)
  );
  const missing = Object.keys(DISPOSITIONS).filter((m) => !tracked.has(m));
  assert.deepEqual(missing, [], "disposition for a file that is not tracked");
});

test("no disposition is ended by the agent that wired the rest", () => {
  // The point of a hold is that ending it is not the wiring agent's call. An
  // entry naming an agent as decider would be a self-issued permission slip.
  const selfDeciding = Object.entries(DISPOSITIONS)
    .filter(([, d]) => /\b(agent|claude|codex|worker)\b/i.test(d.decider))
    .map(([m]) => m);
  assert.deepEqual(selfDeciding, [], "an agent may not be the decider that ends a hold");
});

test("every disposition is complete", () => {
  for (const [module, d] of Object.entries(DISPOSITIONS)) {
    for (const field of ["held_by", "reason", "decider", "unblocks_when"]) {
      assert.ok(
        typeof d[field] === "string" && d[field].trim().length > 0,
        `${module}: ${field} is empty; an incomplete disposition records nothing`
      );
    }
    assert.ok(
      Object.values(HELD_BY).includes(d.held_by),
      `${module}: held_by must be one of the declared kinds, not free text`
    );
  }
});
