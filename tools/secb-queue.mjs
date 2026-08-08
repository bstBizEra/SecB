#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Operator queue tool. Lists what is waiting on a signature and records the
// ruling when one is given.
//
// WHAT THIS TOOL DELIBERATELY CANNOT DO
//
// It cannot sign as the producer. `--as` is required and values that look like
// the producing agent are refused, because the single thing this whole queue
// exists to preserve is that the party who wrote the work is not the party who
// accepts it. A convenience tool that quietly erased that would be worse than
// no tool.
//
// It cannot review. PRs and commits need a reader; `packet` assembles what a
// reader needs and stops there.
//
// It reads the pending set from the records themselves rather than a hardcoded
// list, so it cannot drift out of date and quietly under-report.

const CANDIDATES = "docs/03-project-control/candidates";
const ASSURANCE = "docs/04-assurance";

// Any identity that plausibly names the producing agent. Matching is deliberately
// loose: a false refusal costs one rerun with a clearer name, a false accept
// costs the property this tool exists to protect.
const PRODUCER_PATTERNS = [/claude/i, /codex/i, /\bagent\b/i, /\bassistant\b/i, /\bai\b/i, /gpt/i, /copilot/i];

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

function usage(code = 0) {
  process.stdout.write(`secb-queue — what is waiting on you, and how to answer it

  list                                    show every record awaiting a ruling
  show <record>                           print one record's question and options
  rule <record> --decision <text> --as <name> [--note <text>]
                                          record a ruling on a prepared record
  packet <commit-or-PR>                   assemble what an independent reviewer needs

--as is required for 'rule' and must name a human. Identities that look like the
producing agent are refused: the producer may not accept its own work, and a tool
that let it would remove the only property this queue protects.

Nothing here approves anything by itself. 'rule' writes down a decision you have
already made.
`);
  process.exit(code);
}

const STATUS_PATTERNS = [
  /record_status:\s*"(AWAITING[A-Z_]*)"/,
  /^\*\*Status:\*\*\s*`(PREPARED[^`]*)`/m,
  /^\*\*Status:\*\*\s*`(AWAITING[^`]*)`/m
];

function scan() {
  const out = [];
  for (const dir of [CANDIDATES, ASSURANCE]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!/\.(md|yaml)$/.test(name)) continue;
      const path = join(dir, name);
      const text = readFileSync(path, "utf8");
      const hit = STATUS_PATTERNS.map((re) => re.exec(text)).find(Boolean);
      if (!hit) continue;
      const title = /^#\s+(.+)$/m.exec(text)?.[1]
        ?? /^title:\s*"?(.+?)"?$/m.exec(text)?.[1]
        ?? name;
      const owner = /decision owners?:\**\s*([^\n*]+)/i.exec(text)?.[1]?.trim()
        ?? /^\s*GOV:\s*"([^"]+)"/m.exec(text)?.[1]
        ?? "unstated";
      out.push({ path, name, status: hit[1], title: title.replace(/`/g, "").trim(), owner });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function list() {
  const items = scan();
  if (items.length === 0) {
    process.stdout.write("Nothing is awaiting a ruling.\n");
    return;
  }
  process.stdout.write(`${items.length} record(s) awaiting a ruling:\n\n`);
  for (const it of items) {
    process.stdout.write(`  ${it.name}\n`);
    process.stdout.write(`      ${it.title.slice(0, 88)}\n`);
    process.stdout.write(`      status: ${it.status.slice(0, 60)}\n`);
    process.stdout.write(`      owner:  ${it.owner.slice(0, 70)}\n\n`);
  }
  process.stdout.write("  secb-queue show <name>   to read one\n");
  process.stdout.write("  secb-queue rule <name> --decision \"...\" --as \"Your Name\"\n");
}

function resolve(nameArg) {
  const items = scan();
  const exact = items.find((i) => i.name === nameArg || i.path === nameArg);
  if (exact) return exact;
  const partial = items.filter((i) => i.name.includes(nameArg));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    process.stderr.write(`"${nameArg}" matches ${partial.length} records:\n`);
    for (const p of partial) process.stderr.write(`  ${p.name}\n`);
    process.exit(2);
  }
  process.stderr.write(`No record awaiting a ruling matches "${nameArg}". Try: secb-queue list\n`);
  process.exit(2);
}

function show() {
  const it = resolve(args[1] ?? usage(2));
  const text = readFileSync(it.path, "utf8");
  process.stdout.write(`${it.path}\n\n`);
  // The question and the options, not the whole document.
  const sections = text.split(/\n(?=#{1,3}\s)/);
  for (const s of sections) {
    if (/^#{1,3}\s.*(question|option|ruling|decision|what is being asked|recommend)/i.test(s)) {
      process.stdout.write(`${s.trim()}\n\n`);
    }
  }
  process.stdout.write(`(full record: ${it.path})\n`);
}

function rule() {
  const it = resolve(args[1] ?? usage(2));
  const decision = flag("decision");
  const as = flag("as");
  const note = flag("note");

  if (!decision || !as) {
    process.stderr.write("rule needs --decision and --as.\n");
    process.exit(2);
  }
  const offending = PRODUCER_PATTERNS.find((re) => re.test(as));
  if (offending) {
    process.stderr.write(
      `REFUSED: --as "${as}" looks like the producing agent (matched ${offending}).\n\n` +
      "The producer of a record may not accept it. If this is a human whose name\n" +
      "happens to match, use a form that does not — the refusal is deliberately\n" +
      "blunt because the cost of a false accept is the property this queue exists\n" +
      "to protect.\n"
    );
    process.exit(3);
  }

  const date = new Date().toISOString().slice(0, 10);
  const text = readFileSync(it.path, "utf8");
  const block = it.path.endsWith(".yaml")
    ? `\nruling:\n  decision: ${JSON.stringify(decision)}\n  decided_by: ${JSON.stringify(as)}\n  decided_at: ${JSON.stringify(date)}\n` +
      (note ? `  note: ${JSON.stringify(note)}\n` : "") +
      `  recorded_by: "tools/secb-queue.mjs — transcription only; the decision is the signer's"\n`
    : `\n## Ruling\n\n**Decision:** ${decision}\n**Decided by:** ${as}\n**Date:** ${date}\n` +
      (note ? `**Note:** ${note}\n` : "") +
      `\n*Recorded by \`tools/secb-queue.mjs\`. Transcription only — the decision is the signer's.*\n`;

  writeFileSync(it.path, `${text.replace(/\s*$/, "")}\n${block}`);

  const check = readFileSync(it.path, "utf8");
  if (!check.includes(decision) || !check.includes(as)) {
    process.stderr.write("WRITE VERIFY FAILED — the ruling is not in the file. Nothing was recorded reliably.\n");
    process.exit(1);
  }
  process.stdout.write(`Recorded on ${it.path}\n  ${decision}  —  ${as}, ${date}\n\n`);
  process.stdout.write("The record's own status line was NOT changed. Whoever owns that record\n");
  process.stdout.write("updates it, so a ruling and a status can never silently disagree.\n");
}

function packet() {
  const ref = args[1] ?? usage(2);
  const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return ""; } };

  process.stdout.write(`# Review packet — ${ref}\n\n`);
  const subject = git("log", "-1", "--format=%s", ref);
  if (!subject) {
    process.stdout.write(`"${ref}" is not a commit in this repository.\n`);
    process.stdout.write("For a pull request use: gh pr view <n> --json title,files\n");
    return;
  }
  process.stdout.write(`${subject}\n\n## Files\n\n`);
  process.stdout.write(`${git("show", "--stat", "--format=", ref)}\n\n`);
  process.stdout.write("## What the producer claims\n\n");
  process.stdout.write(`${git("log", "-1", "--format=%b", ref)}\n\n`);
  process.stdout.write("## What a reviewer should check, in this order\n\n");
  process.stdout.write("1. Does every exit code in the message reproduce? Run them; do not read them.\n");
  process.stdout.write("2. Does each new check FAIL when its control is removed? A check that cannot\n");
  process.stdout.write("   fail is not evidence, and a passing suite does not distinguish the two.\n");
  process.stdout.write("3. Did the change touch anything outside its work package's allowed_paths?\n");
  process.stdout.write("4. Does any claim rest on a file or line the reviewer has not opened?\n");
  process.stdout.write("5. Is any measurement taken in the same place the work was done? If so it is\n");
  process.stdout.write("   untested elsewhere — this session found a defect that only appeared in a\n");
  process.stdout.write("   fresh checkout.\n\n");
  process.stdout.write("The producer cannot answer these on its own behalf. That is the point.\n");
}

switch (cmd) {
  case "list": list(); break;
  case "show": show(); break;
  case "rule": rule(); break;
  case "packet": packet(); break;
  default: usage(cmd ? 2 : 0);
}
