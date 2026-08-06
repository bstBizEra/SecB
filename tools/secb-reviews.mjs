#!/usr/bin/env node
/**
 * secb-reviews — locate independent review evidence and bind it to a commit.
 *
 * WHY THIS EXISTS
 *
 * On 2026-08-04 ten open pull requests presented on GitHub as an unreviewed
 * backlog. All ten were reviewed. The evidence was invisible because it lives
 * in three places nobody searches:
 *
 *   1. as a commit INSIDE the branch it reviews — so it is on neither `main`
 *      nor GitHub's review tab
 *   2. as a record file on `main` naming a branch and a commit
 *   3. on a ref outside refs/heads, refs/remotes and refs/tags — nine such
 *      namespaces existed, holding 21 refs, none of them on `origin`
 *
 * Three hand-written searches missed at least one of those each. The fix is not
 * a better memory; it is a command.
 *
 * DESIGN RULE, learned from those three failures: DISCOVER, DO NOT ENUMERATE.
 * The namespace list is not hardcoded. Any ref outside the three standard
 * hierarchies is a candidate, so a namespace invented tomorrow is found without
 * editing this file. The same applies to record headers, whose field names vary
 * between reviewers — SHAs are extracted by shape and then verified against
 * git, rather than read from a field this tool expects to exist.
 *
 * This tool REPORTS. It does not judge a verdict's reasoning, and finding a
 * verdict is not the same as that verdict being sound.
 */

import { execFileSync } from "node:child_process";

const SHA_SHAPE = /\b[0-9a-f]{7,40}\b/g;
const VERDICTS = [
  "APPROVE_FOR_MERGE", "APPROVE_WITH_NOTES", "REQUEST_CHANGES",
  "REJECT", "BLOCK", "NOT_READY", "APPROVE"
];

function git(...args) {
  try {
    // stderr is silenced deliberately. Probing a token that turns out to be a
    // blob is the NORMAL path here, not an error: this repository's guard files
    // are full of 40-hex blob hashes, and every one of them reaches rev-parse
    // as a candidate. Letting git narrate each rejection would bury the report.
    return execFileSync("git", args, {
      encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

/** Refs outside the three standard hierarchies. Discovered, never listed. */
export function candidateRefs() {
  const out = git("for-each-ref", "--format=%(objectname) %(refname)");
  if (!out) return [];
  return out.split("\n").filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split(" ");
      return { sha, ref: rest.join(" ") };
    })
    .filter(({ ref }) =>
      !ref.startsWith("refs/heads/") &&
      !ref.startsWith("refs/remotes/") &&
      !ref.startsWith("refs/tags/") &&
      !ref.startsWith("refs/stash") &&
      // Tool-generated checkpoint namespaces are machine state, not evidence.
      !ref.startsWith("refs/codex/turn-diffs/"));
}

/** Review commits that live inside a branch rather than on a ref of their own. */
export function reviewCommitsOn(branch, base = "origin/main") {
  const out = git("log", "--format=%H%x00%s", `${base}..${branch}`);
  if (!out) return [];
  return out.split("\n").filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\0");
      return { sha, subject };
    })
    .filter(({ subject }) => /\b(REV|REVIEW|CROSSREV|REV-SEC)\b|[Ii]ndependent review/.test(subject));
}

/**
 * Returned when a text states more than one verdict. Deliberately not a member
 * of VERDICTS: a caller testing `verdict === "APPROVE_FOR_MERGE"` gets false.
 */
export const CONFLICTED = "CONFLICTED";

/** Every distinct verdict the text states, ordered by first appearance. */
export function verdictsIn(text) {
  if (!text) return [];
  return VERDICTS
    .map((v) => [text.search(new RegExp(`\\b${v}\\b`)), v])
    .filter(([at]) => at >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}

/**
 * The verdict a text states. Null when it states none — never guessed.
 * CONFLICTED when it states several, because picking one is the laundering this
 * file exists to prevent.
 *
 * MEASURED, not hypothetical. Scanning in VERDICTS declaration order put
 * APPROVE_FOR_MERGE first, and on this repository's 21 evidence refs that
 * reported three branches as APPROVE_FOR_MERGE whose review said
 * REQUEST_CHANGES: mod-integ-queue-third, mod-runtime-s1-checkpoint-ledger-
 * second, mod-wspace-s2-overlap-policy-second.
 *
 * REJECTED: scanning in TEXT order. It fixes only one of those three. The
 * dominant shape of a real record is to CITE the prior review's verdict in its
 * header — "prior review consulted, not trusted: ... verdict APPROVE_FOR_MERGE"
 * — before stating its own further down. Text order therefore returns the
 * PRIOR reviewer's approval, which is the same laundering with a new rule.
 *
 * Telling "the verdict of this record" from "a verdict this record mentions"
 * needs prose comprehension, which the header of this file already refuses to
 * attempt. So the conflict is surfaced instead of resolved: seven of the 21
 * refs now read CONFLICTED and send the reader to the record, and none of them
 * asserts an approval that a REQUEST_CHANGES in the same file contradicts.
 */
export function verdictIn(text) {
  const stated = verdictsIn(text);
  if (!stated.length) return null;
  return stated.length === 1 ? stated[0] : CONFLICTED;
}

/**
 * SHAs a record names that are real commits in this repository.
 * Shape-matched then verified, because record headers use inconsistent field
 * names and a field-driven parser silently returns nothing when they differ.
 */
const resolveCache = new Map();

function resolveCommit(token) {
  if (!resolveCache.has(token)) {
    const full = git("rev-parse", "--quiet", "--verify", `${token}^{commit}`);
    resolveCache.set(token, full ? full.trim() : null);
  }
  return resolveCache.get(token);
}

export function namedCommits(text) {
  if (!text) return [];
  const seen = new Set();
  const found = [];
  for (const token of text.match(SHA_SHAPE) ?? []) {
    const sha = resolveCommit(token);
    if (!sha || seen.has(sha)) continue;
    seen.add(sha);
    found.push(sha);
  }
  return found;
}

/**
 * DELIBERATELY ABSENT: scanning docs/ trees for records filed as ordinary files.
 *
 * That is a real hiding place — `#137`'s verdict lives there and nowhere else,
 * and this tool cannot see it. An implementation was written and removed after
 * one run, which reported:
 *
 *   #137  EXACT_REVIEW_EVIDENCE_FOUND  from wp-gov-vf1-rev-request-001.handoff.yaml
 *   #60   EXACT_REVIEW_EVIDENCE_FOUND  from rev-traceability-reconciliation-001.md
 *
 * The first is a request FOR review. The second is a report ABOUT reviews that
 * happens to tabulate head SHAs. Neither is a verdict, and both were being
 * counted as approval of a branch. It also mislabelled a withdrawal notice as
 * verdict REJECT, and took over ten minutes.
 *
 * Telling "a verdict about X" from "a document mentioning X" in free prose is
 * the hard part of this problem, and a tool that guesses wrong LAUNDERS
 * UNREVIEWED WORK AS APPROVED. That is worse than a tool that says it does not
 * know, so this one says it does not know.
 *
 * A verdict filed on a ref, or committed into the branch it reviews, is found
 * exactly. That is the argument for filing verdicts that way rather than for
 * making this parser cleverer.
 */

/**
 * Formats a verdict can be filed in.
 *
 * This was `.md` only, which is a silent exclusion rather than a disclosed one:
 * a verdict recorded in YAML or JSON was invisible with nothing saying so, and
 * this repository already files review handoffs as `.yaml`. Everything else —
 * source, images, lockfiles — stays out because a verdict is not filed there,
 * and that omission is now the stated one.
 */
export const isRecordFile = (path) => /\.(md|markdown|ya?ml|json|txt)$/i.test(path);

/** Evidence carried by one ref: its record text, the commits it names, its verdict. */
export function evidenceForRef({ sha, ref }) {
  const files = (git("show", "--format=", "--name-only", sha) ?? "")
    .split("\n").filter(isRecordFile);
  const text = files.map((f) => git("show", `${sha}:${f}`) ?? "").join("\n");
  return {
    ref,
    refSha: sha,
    files,
    verdict: verdictIn(text),
    verdicts: verdictsIn(text),
    // The ref's own commit is not evidence about itself.
    names: namedCommits(text).filter((c) => c !== sha)
  };
}

/**
 * Bind evidence to a branch.
 *   EXACT  — a named commit IS the head
 *   STALE  — a named commit is an ancestor of the head, but the head moved
 *   (none) — nothing names a commit on this branch
 */
export function bind(branch, evidence, base = "origin/main") {
  const head = git("rev-parse", `${branch}^{commit}`)?.trim();
  if (!head) return null;

  /**
   * A commit counts as evidence ABOUT this branch only if it is part of what
   * the branch proposes: on the branch and NOT already on the base.
   *
   * The naive test — "is an ancestor of the branch" — matched everything. Every
   * review record states the base it reviewed against, that base is on `main`,
   * and everything on `main` is an ancestor of every branch. The first run of
   * this tool reported all 21 refs as evidence for a single pull request and
   * called a branch whose head IS its reviewed commit STALE. A check that
   * cannot fail is not evidence, and that one could not fail.
   */
  const isProposedByBranch = (sha) =>
    sha === head ||
    (git("merge-base", "--is-ancestor", sha, branch) !== null &&
     git("merge-base", "--is-ancestor", sha, base) === null);
  const onBranch = isProposedByBranch;

  const hits = [];
  for (const e of evidence) {
    const relevant = e.names.filter(onBranch);
    if (!relevant.length) continue;
    hits.push({ ...e, relevant, coversHead: relevant.includes(head) });
  }

  let status = "REVIEW_EVIDENCE_UNKNOWN";
  if (hits.some((h) => h.coversHead)) status = "EXACT_REVIEW_EVIDENCE_FOUND";
  else if (hits.length) status = "STALE_REVIEW";

  return { branch, head, status, hits };
}

/** Every source of evidence, from all three hiding places. */
export function collectEvidence(branch) {
  const fromRefs = candidateRefs().map(evidenceForRef);

  // Reviews committed inside the branch. The commit itself is what a later
  // reader binds to, so it names itself here deliberately.
  const fromBranch = branch
    ? reviewCommitsOn(branch).map(({ sha, subject }) => {
        const inner = evidenceForRef({ sha, ref: `(commit on ${branch})` });
        // The subject line is a fallback only when the record files state
        // nothing; it must not add a second verdict and manufacture a conflict.
        const fallback = inner.verdicts.length ? inner.verdicts : verdictsIn(subject);
        return {
          ...inner,
          verdict: inner.verdict ?? verdictIn(subject),
          verdicts: fallback,
          names: [sha, ...inner.names]
        };
      })
    : [];

  return [...fromRefs, ...fromBranch];
}

/** A conflict is shown in full, so the reader can see what it is between. */
function showVerdict(e) {
  if (e.verdict === CONFLICTED) {
    return `CONFLICTED — states ${e.verdicts.join(", ")}; read the record`;
  }
  return e.verdict ?? "(none stated)";
}

function main(argv) {
  const branch = argv[0];
  if (!branch) {
    const refs = candidateRefs();
    process.stdout.write(`${refs.length} candidate evidence ref(s) outside refs/heads, refs/remotes, refs/tags\n\n`);
    for (const e of refs.map(evidenceForRef)) {
      process.stdout.write(`  ${e.refSha.slice(0, 8)}  ${e.ref.replace(/^refs\//, "")}\n`);
      process.stdout.write(`      verdict: ${showVerdict(e)}   names ${e.names.length} commit(s)\n`);
    }
    process.stdout.write("\n  secb-reviews <branch>   bind evidence to a branch\n");
    return 0;
  }

  const result = bind(branch, collectEvidence(branch));
  if (!result) {
    process.stderr.write(`unknown branch: ${branch}\n`);
    return 2;
  }

  process.stdout.write(`${result.branch}\n  head   ${result.head.slice(0, 8)}\n  status ${result.status}\n\n`);
  if (!result.hits.length) {
    process.stdout.write("  No evidence found. This is not a finding that none exists -\n");
    process.stdout.write("  it means this search did not locate any. Widen before commissioning a review.\n");
    return 1;
  }
  for (const h of result.hits) {
    process.stdout.write(`  ${h.coversHead ? "[HEAD]" : "[    ]"} ${h.ref.replace(/^refs\//, "")}\n`);
    process.stdout.write(`         verdict: ${showVerdict(h)}\n`);
    process.stdout.write(`         names:   ${h.relevant.map((s) => s.slice(0, 8)).join(" ")}\n`);
    for (const f of h.files) process.stdout.write(`         record:  ${f}\n`);
  }
  if (result.status === "STALE_REVIEW") {
    process.stdout.write("\n  The head moved after every located verdict. Confirm freshness before merging.\n");
  }
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  process.exitCode = main(process.argv.slice(2));
}
