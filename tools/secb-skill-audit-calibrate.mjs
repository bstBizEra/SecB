#!/usr/bin/env node
import { loadCorpus } from "../src/audit/corpus.mjs";
import { plant, score } from "../src/audit/calibration.mjs";
import { runSelfTests } from "../src/audit/run.mjs";

// AC-AUDIT-01 calibration run.
//
// The seed is supplied by the caller and is NOT stored here. Whoever holds the
// seed holds the answer key; this tool prints per-class rates and, without
// --reveal, never prints which package was mutated.
//
// The work package assigns the answer key to REV. There is no REV — the operator
// ruled on 2026-08-03 that review stays fail-closed. The seed-holder arrangement
// is the nearest thing available and is WEAKER, in a way worth naming: the
// producer wrote the mutation classes, so it knows what CAN be planted even
// without knowing what WAS. That limits this to measuring detection of an
// enumerated set, which is what the module's own header says it measures.
//
// Exit codes:
//   0  every planted class was detected
//   1  one or more classes were not detected — strike them from claimed coverage
//   2  the calibration could not run soundly

const args = process.argv.slice(2);
const valueOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (flag) => args.includes(flag);

if (has("--help") || !valueOf("--seed", null)) {
  process.stdout.write(`secb-skill-audit-calibrate --seed <seed> [--count N] [--reveal]

Plants known violations in an IN-MEMORY copy of the corpus and measures whether
the checks catch them. .agents/ is never written.

  --seed <s>   required. Hold it privately; it is the answer key.
  --count N    mutations to plant (default 9, one per class)
  --reveal     print which package carried which mutation. Do not use this
               before recording the rates, or the calibration is worthless.

Exit 1 means a class went undetected and must be struck from claimed coverage.
`);
  process.exit(valueOf("--seed", null) ? 0 : 2);
}

const modules = await Promise.all([
  import("../src/audit/checks-governance.mjs"),
  import("../src/audit/checks-declaration.mjs"),
  import("../src/audit/checks-evals.mjs")
]);
const checks = modules.flatMap((m) => m.CHECKS);

// A dead check would score zero detections and look like an uncovered class,
// which is a different and less alarming statement than "the check cannot fail".
// Separate them before measuring anything.
const dead = runSelfTests(checks).filter((r) => !r.ok);
if (dead.length > 0) {
  process.stderr.write(`calibration cannot run: ${dead.length} check(s) fail their own control\n`);
  for (const d of dead) process.stderr.write(`  ${d.id} — ${d.reason}\n`);
  process.exit(2);
}

const base = loadCorpus();
const { corpus: mutatedCorpus, key } = plant(base, {
  seed: valueOf("--seed", null),
  count: Number(valueOf("--count", "9"))
});

const runAll = (corpus) => checks.flatMap((c) => {
  try { return c.run(corpus); } catch { return []; }
});

const result = score({
  key,
  baseline: runAll(base),
  mutated: runAll(mutatedCorpus),
  reveal: has("--reveal")
});

process.stdout.write("# AC-AUDIT-01 calibration\n\n");
process.stdout.write(`Planted ${key.length} mutation(s) across ${new Set(key.map((k) => k.mutation)).size} class(es).\n\n`);
process.stdout.write("| class | arm | targets | planted | caught | rate |\n|---|---|---|---|---|---|\n");
for (const c of result.classes) {
  process.stdout.write(`| ${c.mutation} | ${c.arm} | \`${c.targets}\` | ${c.planted} | ${c.caught} | ${(c.rate * 100).toFixed(0)}% |\n`);
}
process.stdout.write(`\nSpurious violations in unplanted packages: ${result.spurious}\n`);
process.stdout.write(`\n${result.instruction}\n`);

if (result.key) {
  process.stdout.write("\n## Answer key\n\n");
  for (const k of result.key) process.stdout.write(`- ${k.mutation} -> ${k.package}\n`);
}

process.stdout.write("\nThis licenses the checks named above against the mutation classes named above,\n");
process.stdout.write("and nothing else. It is not evidence that the corpus is sound.\n");

process.exit(result.uncovered.length === 0 ? 0 : 1);
