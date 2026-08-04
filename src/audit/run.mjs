import { existsSync, readFileSync } from "node:fs";
import { loadCorpus, VERDICT, CORPUS_ROOT } from "./corpus.mjs";

// WP-SK-AUDIT-01 runner. Composes the check modules, enforces the acceptance
// criteria the work package was authorized under, and refuses to produce a
// claimable result when any of them is unmet.
//
// The criteria are enforced HERE rather than left to each module's discipline,
// because a rule that depends on every future author remembering it is not a
// rule. Every abort below is a criterion refusing to let an unsound result out.

const MODULES = [
  { id: "governance", path: "./checks-governance.mjs" },
  { id: "declaration", path: "./checks-declaration.mjs" },
  { id: "evals", path: "./checks-evals.mjs" }
];

/**
 * AC-AUDIT-02 — both arms, enforced as a gate.
 *
 * Every check must be shown firing on input that should trip it and staying
 * silent on input that should not. A check whose positive arm does not fire
 * cannot fail, and a zero from it is not a finding of "clean" — it is no
 * information at all. When that happens the run ABORTS rather than publishing
 * the other checks' results beside it, because a report that mixes working
 * checks with dead ones reads as one audit.
 */
export function runSelfTests(checks) {
  const results = [];
  for (const check of checks) {
    let outcome;
    try {
      outcome = check.selfTest();
    } catch (error) {
      results.push({ id: check.id, ok: false, reason: `selfTest threw: ${error.message}` });
      continue;
    }
    const positiveFired = outcome?.positive?.fired === true;
    const negativeFired = outcome?.negative?.fired === true;
    results.push({
      id: check.id,
      ok: positiveFired && !negativeFired,
      positive: outcome?.positive ?? null,
      negative: outcome?.negative ?? null,
      reason: positiveFired
        ? (negativeFired ? "negative control fired: the check cannot distinguish" : null)
        : "positive control did not fire: the check cannot fail"
    });
  }
  return results;
}

/**
 * AC-AUDIT-05 — citation binding.
 *
 * Every finding naming a file must resolve at the audited ref. A finding whose
 * citation does not resolve is rejected outright rather than published with a
 * caveat: an unresolvable citation makes the finding an opinion, and an opinion
 * in an audit report is indistinguishable from a fact to everyone downstream.
 */
export function resolveCitations(findings, corpusRoot = CORPUS_ROOT) {
  const kept = [];
  const rejected = [];
  const normalised = [];

  for (const f of findings) {
    if (f.file === null) { kept.push(f); continue; }

    // NORMALISATION, and the reason it exists is a defect of mine worth naming.
    // The module contract said "cite file:line" without saying WHICH path form,
    // so checks split: some cited the repo-root path from `file.path`, others the
    // corpus-relative `file.rel`. 243 sound findings were then rejected as
    // unresolvable — the gate working correctly on an ambiguity the gate's own
    // author introduced.
    //
    // Resolved by normalising to the repo-root form, because that is the one a
    // reader can open. This is NOT tolerance of a bad citation: a path that
    // resolves under neither form is still rejected, and every rewrite is
    // recorded so the report shows what was adjusted rather than presenting the
    // adjusted form as what the check said.
    let file = f.file;
    if (!existsSync(file)) {
      const viaRoot = `${corpusRoot}/${file}`;
      if (existsSync(viaRoot)) {
        normalised.push({ check: f.check, from: file, to: viaRoot });
        file = viaRoot;
      }
    }

    if (!existsSync(file)) {
      rejected.push({ finding: f, reason: `file does not exist under the repo root or ${corpusRoot}/: ${f.file}` });
      continue;
    }
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    if (!Number.isInteger(f.line) || f.line < 1 || f.line > lines.length) {
      rejected.push({ finding: f, reason: `line ${f.line} out of range 1..${lines.length} in ${file}` });
      continue;
    }
    kept.push(file === f.file ? f : Object.freeze({ ...f, file }));
  }
  return { kept, rejected, normalised };
}

/**
 * AC-AUDIT-04 — three-valued output.
 *
 * Counts are reported per verdict and NEVER collapsed to pass/fail. NO_EVIDENCE
 * means the check ran and found nothing, which is not the same as clean: static
 * analysis cannot prove absence. UNDECIDABLE means the method cannot answer.
 * Rendering either as a pass would manufacture the exact defect this system
 * exists to detect, so no field in the returned summary is named or shaped to
 * invite it.
 */
function tally(findings) {
  const counts = { VIOLATION: 0, NO_EVIDENCE: 0, UNDECIDABLE: 0 };
  for (const f of findings) counts[f.verdict] += 1;
  return counts;
}

/**
 * AC-AUDIT-06 — no silent caps.
 *
 * Anything that bounded coverage is returned in `bounds` and belongs in the
 * report headline, not a footnote. A run that audited part of the corpus and
 * said so is honest; one that audited part and reported a total is a false
 * clean bill. A module that is absent is a bound, not a zero.
 */
export async function runAudit({ root, modules = MODULES, now = () => new Date().toISOString() } = {}) {
  const bounds = [];
  const loaded = [];

  for (const mod of modules) {
    try {
      const imported = await import(mod.path);
      if (!Array.isArray(imported.CHECKS)) {
        bounds.push({ kind: "module-contract", module: mod.id, detail: "module exports no CHECKS array; its checks did not run" });
        continue;
      }
      loaded.push({ id: mod.id, checks: imported.CHECKS });
    } catch (error) {
      bounds.push({ kind: "module-absent", module: mod.id, detail: `not loaded, so its checks did not run: ${error.message}` });
    }
  }

  const checks = loaded.flatMap((m) => m.checks);
  const selfTests = runSelfTests(checks);
  const deadChecks = selfTests.filter((r) => !r.ok);

  if (deadChecks.length > 0) {
    return Object.freeze({
      claimable: false,
      abortedBecause: "AC-AUDIT-02",
      detail: "one or more checks failed their own control. A check that cannot fail is not evidence, and its zero is not a finding of clean.",
      deadChecks,
      selfTests,
      bounds,
      findings: [],
      counts: tally([]),
      generatedAt: now()
    });
  }

  const corpus = loadCorpus(root);
  const raw = [];
  for (const { id, checks: moduleChecks } of loaded) {
    for (const check of moduleChecks) {
      try {
        raw.push(...check.run(corpus));
      } catch (error) {
        bounds.push({ kind: "check-threw", module: id, check: check.id, detail: `threw and produced no findings: ${error.message}` });
      }
    }
  }

  const { kept, rejected, normalised } = resolveCitations(raw, corpus.root);
  if (normalised.length > 0) {
    bounds.push({
      kind: "citations-normalised",
      detail: `${normalised.length} citation(s) were corpus-relative and were rewritten to the repo-root form so a reader can open them. The finding text is otherwise unchanged.`,
      normalised
    });
  }
  if (rejected.length > 0) {
    bounds.push({
      kind: "citations-rejected",
      detail: `${rejected.length} finding(s) cited a file:line that does not resolve and were withheld from the report`,
      rejected: rejected.map((r) => ({ check: r.finding.check, file: r.finding.file, line: r.finding.line, reason: r.reason }))
    });
  }

  return Object.freeze({
    claimable: true,
    generatedAt: now(),
    corpus: corpus.counts,
    modulesRun: loaded.map((m) => m.id),
    checksRun: checks.map((c) => c.id),
    selfTests,
    bounds,
    counts: tally(kept),
    findings: kept
  });
}

/**
 * Report text. AC-AUDIT-04 and AC-AUDIT-06 are enforced in the WORDING, not
 * only in the data: the word "pass" appears nowhere, coverage bounds print
 * above the counts rather than below them, and the NO_EVIDENCE line carries its
 * own disclaimer every time so a reader skimming totals cannot take it for a
 * clean result.
 */
export function renderReport(result) {
  const L = [];
  L.push("# SecB skill audit");
  L.push("");
  L.push(`Generated: ${result.generatedAt}`);
  L.push("");

  if (!result.claimable) {
    L.push(`## NOT CLAIMABLE — ${result.abortedBecause}`);
    L.push("");
    L.push(result.detail);
    L.push("");
    for (const d of result.deadChecks) L.push(`- \`${d.id}\` — ${d.reason}`);
    L.push("");
    L.push("No findings are reported. Publishing the surviving checks beside a dead one");
    L.push("would read as a single audit and overstate what was actually examined.");
    return L.join("\n");
  }

  if (result.bounds.length > 0) {
    L.push("## Coverage bounds — read before the counts");
    L.push("");
    L.push("This run did not examine everything it could have. Each line below is");
    L.push("something the counts do not cover.");
    L.push("");
    for (const b of result.bounds) L.push(`- **${b.kind}** — ${b.detail}`);
    L.push("");
  } else {
    L.push("## Coverage bounds");
    L.push("");
    L.push("None. Every module loaded, every check ran, every citation resolved.");
    L.push("");
  }

  L.push("## Corpus");
  L.push("");
  L.push(`${result.corpus.packages} packages, ${result.corpus.governed} governed, ` +
         `${result.corpus.ungoverned} without a manifest, ${result.corpus.files} files.`);
  L.push("");
  L.push("## Counts by verdict");
  L.push("");
  L.push(`- **VIOLATION** ${result.counts.VIOLATION} — evidence contradicts a declaration`);
  L.push(`- **NO_EVIDENCE** ${result.counts.NO_EVIDENCE} — the check ran and found nothing. ` +
         `This is NOT a finding that the corpus is clean: static analysis cannot prove absence.`);
  L.push(`- **UNDECIDABLE** ${result.counts.UNDECIDABLE} — the check cannot answer for this input by this method`);
  L.push("");
  L.push("## Controls");
  L.push("");
  L.push(`${result.selfTests.length} checks, each demonstrated firing on input that should trip it`);
  L.push("and staying silent on input that should not. Without that, a zero above would");
  L.push("carry no information.");
  L.push("");

  const violations = result.findings.filter((f) => f.verdict === VERDICT.VIOLATION);
  if (violations.length > 0) {
    L.push("## Violations");
    L.push("");
    for (const f of violations) {
      const where = f.file ? `${f.file}:${f.line}` : (f.pkg ?? "corpus");
      L.push(`- \`${f.check}\` — ${where} — ${f.observation}`);
    }
    L.push("");
  }

  const undecidable = result.findings.filter((f) => f.verdict === VERDICT.UNDECIDABLE);
  if (undecidable.length > 0) {
    L.push("## Undecidable");
    L.push("");
    L.push("Not violations. These are cases the audit cannot adjudicate by this method,");
    L.push("which is a claim about the audit as much as about the corpus.");
    L.push("");
    const byCheck = new Map();
    for (const f of undecidable) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
    for (const [check, n] of byCheck) L.push(`- \`${check}\` — ${n}`);
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("Findings are observations. This report accepts, waives, closes and approves");
  L.push("nothing, and no field in it is a disposition.");
  return L.join("\n");
}
