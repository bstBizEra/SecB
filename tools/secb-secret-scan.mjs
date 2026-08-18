#!/usr/bin/env node
/**
 * secb-secret-scan — find secret-shaped material in the tracked tree.
 *
 * WHY A REGISTER AND NOT JUST A SCANNER
 *
 * This repository deliberately contains secret-shaped strings. Negative test
 * vectors need them: the credential broker must be shown REJECTING an AWS key
 * id, the redaction evaluator must be shown catching a PEM header, and the
 * gateway's adversarial suite must be shown refusing token literals. Ten such
 * occurrences exist and every one is legitimate.
 *
 * A plain scanner is therefore useless here after its first run. It returns ten
 * hits, a reader learns they are known false positives, and the eleventh — the
 * real one — arrives into a report nobody reads carefully any more. That is
 * alarm fatigue engineered into the repository, and it is worse than no scanner
 * because it looks like coverage.
 *
 * So every legitimate occurrence is REGISTERED, by file, pattern, and the
 * SHA-256 of the matched text. Registered by digest rather than by literal on
 * purpose: an allowlist that quotes the material copies it into a second file,
 * and the point is to have fewer places carrying secret-shaped strings, not
 * more. An unregistered hit, or a registered one whose material changed, is a
 * finding.
 *
 * WHAT THIS IS NOT
 *
 *  - Not provenance. It says nothing about whether a registered string was ever
 *    a real credential; it says the string is the same one that was reviewed.
 *  - Not exhaustive. It matches high-confidence shapes only. A secret with no
 *    recognisable shape — a bare password, an internal token format — passes.
 *    Stated rather than implied, because a scanner's silence is routinely read
 *    as proof of absence.
 *  - Not credential administration, which is out of Phase 0 scope. It detects.
 *
 * USAGE
 *
 *   node tools/secb-secret-scan.mjs            report unregistered hits (exit 1 if any)
 *   node tools/secb-secret-scan.mjs --all      report every hit, registered or not
 *   node tools/secb-secret-scan.mjs --register print register entries for new hits
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * High-confidence shapes only.
 *
 * A pattern earns a place here when a match is far more likely to be credential
 * material than not. Loose patterns (any 32-char hex, any base64 run) were left
 * out: they would bury the register in entries and reproduce the fatigue this
 * tool exists to prevent.
 */
export const PATTERNS = Object.freeze([
  ["aws-access-key-id", /\bAKIA[0-9A-Z]{16}\b/g],
  ["private-key-block", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g],
  ["github-token", /\bghp_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["google-api-key", /\bAIza[0-9A-Za-z\-_]{35}\b/g],
  ["stripe-key", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ["npm-token", /\bnpm_[A-Za-z0-9]{36}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g]
]);

const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Every high-confidence match in the tracked tree. */
export function scan(root = REPO) {
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const hits = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(resolve(root, file), "utf8");
    } catch {
      continue; // binary or unreadable; nothing to match
    }
    for (const [pattern, re] of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        hits.push({
          file,
          line: text.slice(0, m.index).split("\n").length,
          pattern,
          // The digest identifies the material without reproducing it.
          sha256_16: digest(m[0])
        });
      }
    }
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** A hit's identity in the register: file + pattern + digest, never the text. */
export const keyOf = (hit) => `${hit.file}|${hit.pattern}|${hit.sha256_16}`;

// Cross-platform entry-point detection, copied from run-secb-mcp-server.mjs
// rather than reinvented. My first version compared against a hand-built
// `file://${process.argv[1]}`, which never matches a Windows drive path, so the
// CLI silently produced no output at all. That file's comment had already
// recorded the trap.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const hits = scan();
  if (argv.includes("--all")) {
    for (const h of hits) console.log(`${h.pattern.padEnd(20)} ${h.file}:${h.line}  ${h.sha256_16}`);
    console.log(`\n${hits.length} high-confidence match(es). Registration status is asserted in tests/.`);
    process.exit(0);
  }
  if (argv.includes("--register")) {
    for (const h of hits) {
      console.log(`  "${keyOf(h)}": { reason: "TODO", decider: "TODO" },`);
    }
    process.exit(0);
  }
  console.log(`${hits.length} high-confidence match(es) in the tracked tree.`);
  console.log("Run with --all to list them. Whether each is registered is asserted by");
  console.log("tests/secret-scan-register.test.mjs, which is where a finding surfaces.");
}
