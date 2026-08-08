#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runAudit, renderReport } from "../src/audit/run.mjs";

// WP-SK-AUDIT-01 CLI. Read-only against .agents/ — it opens the corpus for
// reading and writes only under docs/04-assurance/skill-audit/, which is this
// work package's only write path.
//
// Exit code is the claim. 0 means the audit RAN soundly, not that the corpus is
// clean — there is deliberately no exit code meaning "clean", because AC-AUDIT-04
// forbids collapsing three verdicts into a pass. Violations are reported in the
// output and do not change the exit status; a caller that wants to gate on them
// reads the counts and decides, which keeps the decision with the caller rather
// than smuggling it into an exit code.
//
//   0  the audit ran and its results are claimable
//   1  the audit could not produce a claimable result (a check failed its own
//      control, per AC-AUDIT-02)

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (has("--help") || has("-h")) {
  process.stdout.write(`secb-skill-audit — audit the skill corpus (WP-SK-AUDIT-01)

  --root <dir>    corpus root (default .agents/skills)
  --out <file>    also write the report to a file
  --json          emit the full result as JSON instead of the report
  --quiet         suppress the report on stdout

Exit 0 means the audit ran soundly. It does NOT mean the corpus is clean:
NO_EVIDENCE is not a pass, and no exit code is defined to mean one.
`);
  process.exit(0);
}

const result = await runAudit({ root: valueOf("--root", undefined) });
const output = has("--json") ? JSON.stringify(result, null, 2) : renderReport(result);

if (!has("--quiet")) process.stdout.write(`${output}\n`);

const out = valueOf("--out", null);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${output}\n`, "utf8");
  if (!has("--quiet")) process.stderr.write(`written: ${out}\n`);
}

process.exit(result.claimable ? 0 : 1);
