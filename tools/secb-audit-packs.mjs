#!/usr/bin/env node
/**
 * secb-audit-packs — emit the AC-AUDIT-03 evidence packs.
 *
 * WHY THIS EXISTS
 *
 * `src/audit/packs.mjs` was delivered with its own acceptance criterion and its
 * own test file, and then had no way to run. Nothing imported it -- not
 * `src/index.mjs`, and not `src/audit/run.mjs`, the audit's own entry point. A
 * capability reachable only from its tests is a capability nobody can use, and
 * the gap was recorded rather than closed because connecting it to `run.mjs`
 * would change what the audit produces, which is not a wiring decision.
 *
 * This is the other way to close it: a SEPARATE entry point. `run.mjs` is
 * untouched and the audit's report is unchanged. What this adds is the ability
 * to actually hand a lens its pack.
 *
 * WHAT A PACK IS
 *
 * One per lens, deliberately not identical. A pack carries the frame the lens
 * reasons in, its brief, its rules, and ONLY the slice of package facts that lens
 * is allowed to see. Three lenses exist -- authority, content, sibling -- and
 * what separates them is what each is blind to. Emitting them all into one file
 * would destroy the property the packs exist to create, so `--out` writes one
 * file per lens and stdout prints one lens at a time.
 *
 * WHAT IT DOES NOT DO
 *
 *  - It does not score. `scoreLensRun()` needs findings from a reviewer who read
 *    a pack, and inventing that intake here would be designing a workflow rather
 *    than exposing a delivered one.
 *  - It never writes inside `.agents/`. The pack declares
 *    `mutation_authorized: false`, and a tool that reads the corpus has no
 *    business writing to it. `--out` refuses a path under `.agents/`.
 *  - It produces no verdict. A pack is an input to a review, not a result.
 *
 * USAGE
 *
 *   node tools/secb-audit-packs.mjs                 list the lenses
 *   node tools/secb-audit-packs.mjs --lens authority   print one pack as JSON
 *   node tools/secb-audit-packs.mjs --out <dir>        write one file per lens
 *   node tools/secb-audit-packs.mjs --ref <label>      label the packs (default: HEAD sha)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "../src/audit/corpus.mjs";
import { LENSES, emitPacks } from "../src/audit/packs.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

/** The ref a pack is bound to. A pack that names no commit is not evidence about one. */
function defaultRef() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "unversioned";
  }
}

function refuseAgentsPath(out) {
  const rel = relative(REPO, resolve(REPO, out)).replaceAll("\\", "/");
  if (rel === ".agents" || rel.startsWith(".agents/")) {
    console.error(
      `secb-audit-packs: refusing to write to "${out}".\n` +
        "The skills pack declares mutation_authorized: false, and this tool reads that corpus. " +
        "Emitting into the thing being audited is how an audit starts describing its own output."
    );
    process.exit(2);
  }
}

if (has("--help") || has("-h")) {
  console.log(
    [
      "secb-audit-packs — emit the AC-AUDIT-03 evidence packs, one per lens.",
      "",
      "  (no args)          list the lenses and what each is allowed to see",
      "  --lens <id>        print that lens's pack as JSON",
      "  --out <dir>        write one file per lens (refuses paths under .agents/)",
      "  --ref <label>      label the packs (default: short HEAD sha)",
      "",
      "Emits inputs to a review. It scores nothing and produces no verdict."
    ].join("\n")
  );
  process.exit(0);
}

const ref = valueOf("--ref", defaultRef());
const corpus = loadCorpus();
const packs = emitPacks(corpus, { ref });

const lensId = valueOf("--lens", null);
const out = valueOf("--out", null);

if (lensId) {
  const pack = packs.find((p) => p.lens === lensId);
  if (!pack) {
    console.error(
      `secb-audit-packs: unknown lens "${lensId}". Known: ${LENSES.map((l) => l.id).join(", ")}`
    );
    process.exit(2);
  }
  console.log(JSON.stringify(pack, null, 2));
} else if (out) {
  refuseAgentsPath(out);
  const dir = resolve(REPO, out);
  mkdirSync(dir, { recursive: true });
  for (const pack of packs) {
    // ONE FILE PER LENS. A single combined file would hand every lens what the
    // others were meant to be blind to, which is the whole property.
    const file = resolve(dir, `pack-${pack.lens}-${ref}.json`);
    writeFileSync(file, `${JSON.stringify(pack, null, 2)}\n`);
    console.log(`${relative(REPO, file).replaceAll("\\", "/")}  ${pack.packages.length} package(s)`);
  }
  console.log(
    `\n${packs.length} pack(s) at ref ${ref}. Each is one lens's input to a review — no verdict, no score.`
  );
} else {
  console.log(`AC-AUDIT-03 evidence packs — ref ${ref}, corpus ${corpus.packages.length} package(s)\n`);
  const width = Math.max(...packs.map((p) => p.lens.length));
  for (const pack of packs) {
    console.log(`${pack.lens.padEnd(width)}  ${pack.packages.length} package(s), ${pack.rules.length} rule(s)`);
    console.log(`${" ".repeat(width)}  ${pack.frame.slice(0, 96)}`);
  }
  console.log("\n--lens <id> to print one, --out <dir> to write them. Nothing here is a verdict.");
}

if (!existsSync(resolve(REPO, ".agents/skills"))) {
  console.error("secb-audit-packs: .agents/skills is missing; every pack above is empty by default.");
  process.exit(1);
}
