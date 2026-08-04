import { readFileSync } from "node:fs";

import { finding, lineOf, readShallowYaml, VERDICT } from "./corpus.mjs";

// WP-SK-AUDIT-01 — evaluation-suite checks.
//
// The prior review of this corpus reported four numbers (220 expectation
// instances from 10 distinct strings, zero skill-specific expectation text,
// ~30% undecidable, 0 of 22 negative cases capable of failing) from an ad-hoc
// analysis that was never repeatable. This module re-derives them mechanically
// so they become numbers the project has to keep answering, and so a reader can
// disagree with the *criterion* rather than only with the count. Every criterion
// below is stated in the check's `describe` and re-stated in the finding
// evidence.
//
// READ-ONLY. Nothing here opens a write path under .agents/ — PACK.yaml declares
// mutation_authorized: false and WP-SK-AUDIT-01 lists .agents/** in
// prohibited_paths. Files are read with readFileSync and never written.
//
// This module JUDGES. corpus.mjs computes; the judgements live here, and each
// one is three-valued: a check that cannot answer returns UNDECIDABLE rather
// than reporting "nothing found", because "I could not read it" is not "it is
// not there".

// ---------------------------------------------------------------------------
// Cases-file reader
// ---------------------------------------------------------------------------

const KEY = /^([A-Za-z0-9_.-]+):\s*(.*)$/;

/**
 * Reads the exact YAML shape the eval corpus uses: top-level scalars, a `cases:`
 * sequence, one level of case fields, and sequence-of-scalar fields with plain
 * multi-line continuations.
 *
 * corpus.mjs's readShallowYaml is deliberately too minimal for this shape (it
 * flattens `cases:` into a single mixed array), so this reader exists — with the
 * same discipline: anything it cannot represent unambiguously is pushed to
 * `unreadable` with a reason, and a check that sees a non-empty `unreadable`
 * must return UNDECIDABLE for that file rather than reasoning over a partial
 * parse. A deeper-indented line that looks like `key: value` is *ambiguous*
 * (nested map, or a wrapped scalar that happens to contain a colon) and is
 * reported unreadable rather than guessed.
 */
export function parseCasesFile(text) {
  const lines = text.split(/\r?\n/);
  const top = {};
  const cases = [];
  const unreadable = [];

  let inCases = false;
  let cur = null;
  let seqKey = null;
  let cont = null; // last scalar slot that a continuation line may extend

  const bad = (line, raw, why) => unreadable.push({ line, text: raw, why });

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (!raw.trim()) continue;
    if (raw.trimStart().startsWith("#")) continue;

    const indent = raw.length - raw.trimStart().length;
    const body = raw.trim();

    // Top-level key.
    if (indent === 0 && !body.startsWith("- ")) {
      const m = KEY.exec(body);
      if (!m) { bad(lineNo, raw, "top-level line is neither a key nor a sequence item"); continue; }
      const [, key, rest] = m;
      seqKey = null;
      cont = null;
      if (key === "cases") {
        inCases = true;
        cur = null;
        top.__casesLine = lineNo;
        if (rest !== "") bad(lineNo, raw, "inline `cases:` value is not supported by this reader");
        continue;
      }
      inCases = false;
      cur = null;
      top[key] = { value: rest, line: lineNo };
      if (rest !== "") cont = top[key];
      continue;
    }

    // New case.
    if (indent === 0 && body.startsWith("- ")) {
      if (!inCases) { bad(lineNo, raw, "sequence item outside a `cases:` block"); continue; }
      cur = { startLine: lineNo, fields: {}, fieldIndent: null };
      cases.push(cur);
      seqKey = null;
      cont = null;
      const m = KEY.exec(body.slice(2).trim());
      if (!m) { bad(lineNo, raw, "case item is not `key: value`"); continue; }
      const applied = applyField(cur, m[1], m[2], lineNo);
      seqKey = applied.seqKey;
      cont = applied.cont;
      continue;
    }

    if (cur === null) { bad(lineNo, raw, "indented line before any case"); continue; }
    if (cur.fieldIndent === null) cur.fieldIndent = indent;

    if (indent === cur.fieldIndent) {
      if (body.startsWith("- ")) {
        if (seqKey === null) { bad(lineNo, raw, "sequence item with no owning key"); continue; }
        const item = { value: body.slice(2).trim(), line: lineNo };
        cur.fields[seqKey].seq.push(item);
        cont = item;
        continue;
      }
      const m = KEY.exec(body);
      if (!m) { bad(lineNo, raw, "case field is not `key: value`"); continue; }
      const applied = applyField(cur, m[1], m[2], lineNo);
      seqKey = applied.seqKey;
      cont = applied.cont;
      continue;
    }

    if (indent > cur.fieldIndent) {
      if (body.startsWith("- ")) { bad(lineNo, raw, "nested sequence is not supported by this reader"); continue; }
      if (KEY.test(body)) { bad(lineNo, raw, "ambiguous: nested map or a wrapped scalar containing a colon"); continue; }
      if (cont === null) { bad(lineNo, raw, "continuation line with no preceding scalar"); continue; }
      cont.value = `${cont.value} ${body}`.trim();
      continue;
    }

    bad(lineNo, raw, "dedented below the case field indent");
  }

  const normalised = cases.map((c) => ({
    startLine: c.startLine,
    id: c.fields.id?.value ?? null,
    idLine: c.fields.id?.line ?? null,
    type: c.fields.type?.value ?? null,
    typeLine: c.fields.type?.line ?? null,
    prompt: c.fields.prompt?.value ?? null,
    promptLine: c.fields.prompt?.line ?? null,
    // null means "no expect key at all"; [] means "an empty expect list".
    expect: c.fields.expect?.seq ? c.fields.expect.seq.map((e) => ({ text: e.value, line: e.line })) : null,
    expectLine: c.fields.expect?.line ?? null
  }));

  return { skill: top.skill?.value ?? null, cases: normalised, unreadable, complete: unreadable.length === 0 };
}

function applyField(cur, key, rest, lineNo) {
  if (rest === "") {
    cur.fields[key] = { seq: [], line: lineNo };
    return { seqKey: key, cont: null };
  }
  cur.fields[key] = { value: rest, line: lineNo };
  return { seqKey: null, cont: cur.fields[key] };
}

// ---------------------------------------------------------------------------
// Fact collection (shared by all four checks, computed once per corpus)
// ---------------------------------------------------------------------------

const FACTS = new WeakMap();

function fileText(f) {
  // In-memory corpora (selfTest fixtures) carry `text`; the real corpus does not.
  return typeof f.text === "string" ? f.text : readFileSync(f.path, "utf8");
}

function normalise(s) {
  return s.replace(/\s+/g, " ").trim();
}

export function evalFacts(corpus) {
  const cached = FACTS.get(corpus);
  if (cached) return cached;

  const packages = corpus.packages.map((pkg) => {
    const evalFiles = pkg.files.filter((f) => f.rel.startsWith(`${pkg.name}/evals/`));
    const casesFiles = evalFiles
      .filter((f) => /\.ya?ml$/i.test(f.rel))
      .map((f) => {
        const text = fileText(f);
        const parsed = parseCasesFile(text);
        return { rel: f.rel, path: f.path, text, ...parsed };
      });
    return {
      name: pkg.name,
      pkg,
      governed: pkg.governed,
      evalFiles,
      casesFiles,
      hasEvals: casesFiles.length > 0,
      parseComplete: casesFiles.every((c) => c.complete)
    };
  });

  // Corpus-wide expectation index.
  const byText = new Map();
  let instances = 0;
  for (const p of packages) {
    for (const cf of p.casesFiles) {
      for (const c of cf.cases) {
        for (const e of c.expect ?? []) {
          const key = normalise(e.text);
          instances += 1;
          if (!byText.has(key)) byText.set(key, { count: 0, packages: new Set(), first: null });
          const rec = byText.get(key);
          rec.count += 1;
          rec.packages.add(p.name);
          if (rec.first === null) rec.first = { pkg: p.name, file: cf.rel, path: cf.path, line: e.line };
        }
      }
    }
  }

  const facts = { corpus, packages, byText, instances, distinct: byText.size };
  FACTS.set(corpus, facts);
  return facts;
}

// ---------------------------------------------------------------------------
// Expectation predicates. Each is deliberately shallow and inspectable — the
// criterion is meant to be argued with, not trusted.
// ---------------------------------------------------------------------------

/**
 * Phrases that assert an ABSENCE. An output consisting of nothing at all
 * satisfies every one of them, which is the whole point of the DEF-M1 check.
 */
const PROHIBITION = [
  /^(no|none|never|neither)\b/i,
  /\b(should not|shall not|must not|may not|will not|does not|do not|did not|is not|are not|was not|were not|cannot|can not|won't|don't|doesn't|isn't|aren't)\b/i,
  /\b(avoid|refrain from|abstain from|omit|withhold|suppress)\b/i,
  /\bwithout\b/i
];

/** Splits on top-level disjunction, so "A or B" can be judged branch by branch. */
function disjuncts(text) {
  return text.split(/\s+\bor\b\s+/i).map((s) => s.trim()).filter(Boolean);
}

export function isProhibition(text) {
  return PROHIBITION.some((re) => re.test(text));
}

/**
 * True when a run that emitted NOTHING would satisfy the expectation — either
 * because the expectation only forbids things, or because at least one branch of
 * a disjunction only forbids things.
 */
export function satisfiedByEmptyOutput(text) {
  const t = normalise(text);
  if (t === "") return true;
  if (isProhibition(t)) return true;
  const parts = disjuncts(t);
  return parts.length > 1 && parts.some((p) => isProhibition(p));
}

/** Judgement predicates: adjectives/verbs whose truth is an opinion about prose. */
const JUDGEMENT = /\b(explicit|explicitly|implicit|bounded|unbounded|well[- ]structured|well[- ]formed|appropriate|appropriately|clear|clearly|correct|corrected|correctly|proper|properly|reasonable|reasonably|adequate|adequately|followed|follows|separated|separate|sufficient|sufficiently|relevant|coherent|consistent|robust|sensible|accurate|meaningful|useful|concise|comprehensive|thorough|high[- ]quality|good|better|best|readable|idiomatic|graceful|gracefully|helpful)\b/i;

/** Verbs that require reading intent or checking the world, not the transcript. */
const SEMANTIC = /\b(claim|claims|claimed|claiming|explain|explains|explained|explaining|fabricate|fabricates|fabricated|invent|invents|invented|hallucinate|hallucinates|hallucinated|understand|understands|interpret|interprets|infer|infers|imply|implies|acknowledge|acknowledges|assume|assumes|justify|justifies|rationalis|rationaliz)\w*\b/i;

/**
 * Something a procedure could actually look at: a quoted literal, an identifier,
 * a path, a number, or an explicit matching/exit predicate.
 */
// Case-SENSITIVE: an ALLCAPS/identifier token (ADR-0013, SECB-ARCH-001, R5).
// This one must not carry the `i` flag — with it, [A-Z] matches lowercase and
// every ordinary word would register as an identifier, which silently disables
// the whole check.
const OBSERVABLE_IDENT = /\b[A-Z][A-Z0-9]{2,}(?:[-_][A-Z0-9]+)*\b/;

// Case-insensitive: quoted literals, paths, numbers, and explicit predicates.
const OBSERVABLE_TEXT = new RegExp(
  [
    '"[^"]+"',
    "'[^']+'",
    "`[^`]+`",
    "[“‘][^”’]+[”’]",
    "\\b[\\w./-]+\\.(?:ya?ml|json|md|mjs|cjs|js|ts|txt|toml|csv|sh)\\b",
    "\\b(?:exit code|status code|http \\d+|returns?|equals?|contains?|includes?|matches?|starts with|ends with|at least|at most|exactly|greater than|less than)\\b",
    "\\b\\d+\\b"
  ].join("|"),
  "i"
);

function hasObservable(text) {
  return OBSERVABLE_IDENT.test(text) || OBSERVABLE_TEXT.test(text);
}

/**
 * True when no mechanical procedure could evaluate the expectation as written:
 * it names nothing a procedure could look at, AND its predicate is a judgement
 * about prose or an attribution of intent.
 */
export function isMechanicallyUndecidable(text) {
  const t = normalise(text);
  if (t === "") return false; // an empty expectation is check 2's problem, not this one
  if (hasObservable(t)) return false;
  return JUDGEMENT.test(t) || SEMANTIC.test(t);
}

/** Cases whose purpose is to demonstrate a failure/refusal path. */
const FAILURE_TYPE = new Set(["negative", "adversarial", "boundary", "failure", "refusal", "error"]);
const FAILURE_ID = /negative|fail|adversar|reject|refus|error|abuse|misuse|out[-_ ]?of[-_ ]?scope/i;

export function isFailureCase(c) {
  if (c.type && FAILURE_TYPE.has(normalise(c.type).toLowerCase())) return true;
  return Boolean(c.id && FAILURE_ID.test(c.id));
}

/** Narrower: the arms whose entire job is to show the skill declining. */
export function isNegativeCase(c) {
  const t = c.type ? normalise(c.type).toLowerCase() : null;
  if (t === "negative" || t === "refusal") return true;
  return Boolean(c.id && /negative|refus|out[-_ ]?of[-_ ]?scope/i.test(c.id));
}

// ---------------------------------------------------------------------------
// Shared UNDECIDABLE emission for files this reader could not fully read.
// ---------------------------------------------------------------------------

function unreadableFindings(check, facts) {
  const out = [];
  for (const p of facts.packages) {
    for (const cf of p.casesFiles) {
      if (cf.complete) continue;
      const first = cf.unreadable[0];
      out.push(finding({
        check,
        pkg: p.name,
        file: cf.rel,
        line: first.line,
        verdict: VERDICT.UNDECIDABLE,
        observation: `${cf.rel} could not be fully read (${cf.unreadable.length} line(s)); this check refuses to reason over a partial parse, because treating unread content as absent is how a check stops being able to fail.`,
        evidence: {
          reason: first.why,
          unreadableLines: cf.unreadable.slice(0, 10).map((u) => ({ line: u.line, why: u.why })),
          unreadableCount: cf.unreadable.length
        }
      }));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export const CHECKS = [
  {
    id: "evals.expectation-diversity",
    describe:
      "Counts expectation instances against distinct expectation strings and flags boilerplate — a string reused by more than half the eval-bearing packages — and any package whose expectations are all shared, meaning it contributes no skill-specific expectation text.",
    run(corpus) {
      const facts = evalFacts(corpus);
      const out = unreadableFindings("evals.expectation-diversity", facts);

      const evalPackages = facts.packages.filter((p) => p.hasEvals);
      const threshold = evalPackages.length / 2;

      const boilerplate = [...facts.byText.entries()]
        .filter(([, rec]) => rec.packages.size > threshold)
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

      const perPackage = facts.packages
        .filter((p) => p.hasEvals)
        .map((p) => {
          const texts = [];
          for (const cf of p.casesFiles) {
            for (const c of cf.cases) for (const e of c.expect ?? []) texts.push(normalise(e.text));
          }
          const distinct = new Set(texts);
          const unique = [...distinct].filter((t) => facts.byText.get(t).packages.size === 1);
          return { pkg: p.name, instances: texts.length, distinct: distinct.size, uniqueToPackage: unique.length };
        });

      const rep = boilerplate[0]?.[1].first ?? facts.byText.values().next().value?.first ?? null;
      const ratio = facts.distinct === 0 ? null : Number((facts.instances / facts.distinct).toFixed(2));

      out.push(finding({
        check: "evals.expectation-diversity",
        pkg: null,
        file: rep ? rep.file : null,
        line: rep ? rep.line : null,
        verdict: boilerplate.length > 0 ? VERDICT.VIOLATION : VERDICT.NO_EVIDENCE,
        observation: boilerplate.length > 0
          ? `${facts.instances} expectation instance(s) across ${evalPackages.length} eval-bearing package(s) collapse to ${facts.distinct} distinct string(s) (${ratio} instances per string); ${boilerplate.length} string(s) are reused by more than half the packages.`
          : `${facts.instances} expectation instance(s) across ${evalPackages.length} eval-bearing package(s) resolve to ${facts.distinct} distinct string(s); no string is shared by more than half the packages. This reports counts only and does not establish that the suite is diverse.`,
        evidence: {
          criterion: "boilerplate := an expectation string appearing in more than 50% of eval-bearing packages",
          instances: facts.instances,
          distinct: facts.distinct,
          instancesPerDistinctString: ratio,
          evalBearingPackages: evalPackages.length,
          boilerplateStrings: boilerplate.map(([text, rec]) => ({
            text,
            instances: rec.count,
            packages: rec.packages.size,
            citation: `${rec.first.file}:${rec.first.line}`
          })),
          perPackage
        }
      }));

      for (const p of facts.packages) {
        if (!p.hasEvals || !p.parseComplete) continue;
        const row = perPackage.find((r) => r.pkg === p.name);
        if (!row || row.instances === 0 || row.uniqueToPackage > 0) continue;
        const cf = p.casesFiles.find((c) => c.cases.some((x) => (x.expect ?? []).length > 0));
        const firstExpect = cf.cases.find((x) => (x.expect ?? []).length > 0).expect[0];
        out.push(finding({
          check: "evals.expectation-diversity",
          pkg: p.name,
          file: cf.rel,
          line: firstExpect.line,
          verdict: VERDICT.VIOLATION,
          observation: `${p.name} states ${row.instances} expectation(s), none of which is unique to this package — every expectation string it uses also appears in at least one other package, so the suite contains no expectation text specific to this skill.`,
          evidence: {
            criterion: "a package contributes skill-specific expectation text iff at least one of its expectation strings appears in no other package",
            instances: row.instances,
            distinctWithinPackage: row.distinct,
            uniqueToPackage: 0,
            sample: normalise(firstExpect.text)
          }
        }));
      }

      return out;
    },
    selfTest() {
      const shared = casesYaml("a", [
        { id: "positive-direct", type: "positive", prompt: "do the thing", expect: ["skill should trigger", "required workflow should be followed"] }
      ]);
      const sharedB = casesYaml("b", [
        { id: "positive-direct", type: "positive", prompt: "do the other thing", expect: ["skill should trigger", "required workflow should be followed"] }
      ]);
      const positiveCorpus = synthCorpus([
        synthPackage({ name: "a", cases: shared }),
        synthPackage({ name: "b", cases: sharedB })
      ]);
      const negativeCorpus = synthCorpus([
        synthPackage({
          name: "a",
          cases: casesYaml("a", [
            { id: "positive-direct", type: "positive", prompt: "p", expect: ["emits an intake brief naming the a-specific owner column", "records the a-specific routing table"] }
          ])
        }),
        synthPackage({
          name: "b",
          cases: casesYaml("b", [
            { id: "positive-direct", type: "positive", prompt: "p", expect: ["emits a b-specific container diagram", "records the b-specific deployment node list"] }
          ])
        })
      ]);
      const pos = this.run(positiveCorpus);
      const neg = this.run(negativeCorpus);
      const posV = pos.filter((f) => f.verdict === VERDICT.VIOLATION);
      const negV = neg.filter((f) => f.verdict === VERDICT.VIOLATION);
      return {
        positive: {
          fired: posV.length > 0,
          detail: `two packages sharing both expectation strings verbatim produced ${posV.length} VIOLATION(s): 1 corpus summary (4 instances / 2 distinct) + 1 per package with zero package-unique strings`
        },
        negative: {
          fired: negV.length > 0,
          detail: `two packages with entirely package-specific expectations produced ${negV.length} VIOLATION(s) and ${neg.filter((f) => f.verdict === VERDICT.NO_EVIDENCE).length} NO_EVIDENCE summary`
        }
      };
    }
  },

  {
    id: "evals.negative-case-cannot-fail",
    describe:
      "Flags a negative or failure case that the empty output would satisfy — every stated expectation is an absence-assertion, or a disjunction with an absence-assertion branch — because such a case cannot separate a passing run from a run that produced nothing and is therefore not evidence (DEF-M1).",
    run(corpus) {
      const facts = evalFacts(corpus);
      const out = unreadableFindings("evals.negative-case-cannot-fail", facts);

      let failureCases = 0;
      let cannotFail = 0;
      let nonFailureCannotFail = 0;
      // Narrower slice, reported alongside the failure-family count so the
      // corpus-level "N of 22 negative cases" figure can be checked directly.
      let negativeCases = 0;
      let negativeCannotFail = 0;

      for (const p of facts.packages) {
        if (!p.hasEvals || !p.parseComplete) continue;
        let sawFailureCase = false;

        for (const cf of p.casesFiles) {
          for (const c of cf.cases) {
            const expect = c.expect;
            const isFailure = isFailureCase(c);
            const isNegative = isNegativeCase(c);
            if (isFailure) { sawFailureCase = true; failureCases += 1; }
            if (isNegative) negativeCases += 1;

            const vacuous = expect === null || expect.length === 0;
            const perExpectation = (expect ?? []).map((e) => ({
              text: normalise(e.text),
              line: e.line,
              satisfiedByEmptyOutput: satisfiedByEmptyOutput(e.text)
            }));
            const incapable = vacuous || perExpectation.every((e) => e.satisfiedByEmptyOutput);

            if (!incapable) continue;
            if (isNegative) negativeCannotFail += 1;
            if (!isFailure) { nonFailureCannotFail += 1; continue; }
            cannotFail += 1;

            const line = expect && expect.length > 0 ? expect[0].line : (c.expectLine ?? c.startLine);
            out.push(finding({
              check: "evals.negative-case-cannot-fail",
              pkg: p.name,
              file: cf.rel,
              line,
              verdict: VERDICT.VIOLATION,
              observation: vacuous
                ? `Case "${c.id ?? "(unnamed)"}" (type ${c.type ?? "unknown"}) states no expectations, so every possible output satisfies it and no run of this case can fail.`
                : `Case "${c.id ?? "(unnamed)"}" (type ${c.type ?? "unknown"}) states ${perExpectation.length} expectation(s), all of which the empty output satisfies; a run that produced nothing would pass, so this case cannot distinguish a passing run from a failing one.`,
              evidence: {
                criterion: "a case cannot fail iff it states no expectations, or every stated expectation is satisfied by the empty output (an absence-assertion, or a disjunction with an absence-assertion branch)",
                caseId: c.id,
                caseType: c.type,
                caseStartLine: c.startLine,
                expectations: perExpectation
              }
            }));
          }
        }

        if (!sawFailureCase) {
          const cf = p.casesFiles[0];
          out.push(finding({
            check: "evals.negative-case-cannot-fail",
            pkg: p.name,
            file: cf.rel,
            line: cf.cases[0]?.startLine ?? 1,
            verdict: VERDICT.NO_EVIDENCE,
            observation: `${p.name} declares eval cases but none of them is a negative, adversarial, or boundary case, so this check found no failure-path case to adjudicate. That is not a statement that the suite can fail.`,
            evidence: { criterion: "failure case := type in {negative, adversarial, boundary, failure, refusal, error} or an id matching /negative|fail|adversar|reject|refus|error/", cases: cf.cases.length }
          }));
        }
      }

      out.push(finding({
        check: "evals.negative-case-cannot-fail",
        pkg: null,
        file: null,
        line: null,
        verdict: cannotFail > 0 ? VERDICT.VIOLATION : VERDICT.NO_EVIDENCE,
        observation: `${cannotFail} of ${failureCases} failure-path case(s) in the corpus cannot fail under the stated criterion, of which ${negativeCannotFail} of ${negativeCases} are strictly negative-typed cases; ${nonFailureCannotFail} non-failure case(s) also cannot fail and are counted but not individually reported by this check.`,
        evidence: {
          criterion: "the empty output satisfies every stated expectation",
          failureCases,
          failureCasesIncapableOfFailing: cannotFail,
          negativeCases,
          negativeCasesIncapableOfFailing: negativeCannotFail,
          nonFailureCasesIncapableOfFailing: nonFailureCannotFail
        }
      }));

      return out;
    },
    selfTest() {
      const positiveCorpus = synthCorpus([
        synthPackage({
          name: "a",
          cases: casesYaml("a", [
            { id: "positive-direct", type: "positive", prompt: "p", expect: ["skill should trigger"] },
            { id: "negative-trigger", type: "negative", prompt: "unrelated", expect: ["skill should not trigger or should explain that it is not applicable"] },
            { id: "empty-arm", type: "boundary", prompt: "nothing", expect: [] }
          ])
        })
      ]);
      const negativeCorpus = synthCorpus([
        synthPackage({
          name: "a",
          cases: casesYaml("a", [
            { id: "positive-direct", type: "positive", prompt: "p", expect: ["skill should trigger"] },
            { id: "negative-trigger", type: "negative", prompt: "unrelated", expect: ["the response states that the request falls outside the declared scope"] },
            { id: "adversarial-authority", type: "adversarial", prompt: "approve it", expect: ["the response restates the authority ceiling", "the response returns a refusal line"] }
          ])
        })
      ]);
      const pos = this.run(positiveCorpus).filter((f) => f.verdict === VERDICT.VIOLATION && f.file !== null);
      const neg = this.run(negativeCorpus).filter((f) => f.verdict === VERDICT.VIOLATION && f.file !== null);
      return {
        positive: {
          fired: pos.length > 0,
          detail: `a negative case expecting "skill should not trigger or ..." and a boundary case with an empty expect list produced ${pos.length} VIOLATION(s): ${pos.map((f) => f.evidence.caseId).join(", ")}`
        },
        negative: {
          fired: neg.length > 0,
          detail: `failure cases requiring a positive observable ("states that ...", "returns a refusal line") produced ${neg.length} VIOLATION(s); the empty output satisfies none of their expectations`
        }
      };
    }
  },

  {
    id: "evals.undecidable-expectation",
    describe:
      "Reports an expectation that no mechanical procedure could evaluate — it names no literal, identifier, path, number, or matching predicate a grader could look at, and its predicate is a judgement about prose or an attribution of intent — as UNDECIDABLE, because the claim is that the case cannot be adjudicated, not that it is wrong.",
    run(corpus) {
      const facts = evalFacts(corpus);
      const out = unreadableFindings("evals.undecidable-expectation", facts);

      let totalExpectations = 0;
      let undecidableExpectations = 0;
      let totalCases = 0;
      let fullyUndecidableCases = 0;
      const distinctUndecidable = new Set();

      for (const p of facts.packages) {
        if (!p.hasEvals || !p.parseComplete) continue;
        for (const cf of p.casesFiles) {
          for (const c of cf.cases) {
            const expect = c.expect ?? [];
            totalCases += 1;
            let undecidableHere = 0;

            for (const e of expect) {
              totalExpectations += 1;
              if (!isMechanicallyUndecidable(e.text)) continue;
              undecidableExpectations += 1;
              undecidableHere += 1;
              distinctUndecidable.add(normalise(e.text));
              out.push(finding({
                check: "evals.undecidable-expectation",
                pkg: p.name,
                file: cf.rel,
                line: e.line,
                verdict: VERDICT.UNDECIDABLE,
                observation: `Expectation "${normalise(e.text)}" in case "${c.id ?? "(unnamed)"}" names nothing a procedure could inspect and asserts a judgement about prose or an attribution of intent, so no mechanical grader could return a verdict for it. This says the case cannot be adjudicated, not that the case is wrong.`,
                evidence: {
                  criterion: "undecidable := the expectation contains no observable token (quoted literal, identifier, path, number, or explicit matching/exit predicate) AND its predicate is a judgement adjective or a semantic-attribution verb",
                  caseId: c.id,
                  caseType: c.type,
                  expectation: normalise(e.text),
                  judgementTerm: (JUDGEMENT.exec(e.text) ?? [null])[0],
                  semanticTerm: (SEMANTIC.exec(e.text) ?? [null])[0]
                }
              }));
            }

            if (expect.length > 0 && undecidableHere === expect.length) fullyUndecidableCases += 1;
          }
        }
      }

      const share = totalExpectations === 0 ? null : Number(((undecidableExpectations / totalExpectations) * 100).toFixed(2));
      out.push(finding({
        check: "evals.undecidable-expectation",
        pkg: null,
        file: null,
        line: null,
        verdict: undecidableExpectations > 0 ? VERDICT.UNDECIDABLE : VERDICT.NO_EVIDENCE,
        observation: undecidableExpectations > 0
          ? `${undecidableExpectations} of ${totalExpectations} expectation instance(s) (${share}%), drawn from ${distinctUndecidable.size} distinct string(s), are undecidable by any mechanical procedure; ${fullyUndecidableCases} of ${totalCases} case(s) consist entirely of such expectations and cannot be adjudicated at all.`
          : `No expectation in ${totalExpectations} instance(s) met the undecidability criterion. This does not establish that the remainder are decidable in practice.`,
        evidence: {
          criterion: "no observable token AND a judgement/semantic predicate",
          totalExpectations,
          undecidableExpectations,
          undecidableSharePercent: share,
          distinctUndecidableStrings: distinctUndecidable.size,
          totalCases,
          fullyUndecidableCases
        }
      }));

      return out;
    },
    selfTest() {
      const positiveCorpus = synthCorpus([
        synthPackage({
          name: "a",
          cases: casesYaml("a", [
            { id: "positive-direct", type: "positive", prompt: "p", expect: ["the response is well-structured", "facts and assumptions remain separated"] }
          ])
        })
      ]);
      const negativeCorpus = synthCorpus([
        synthPackage({
          name: "a",
          cases: casesYaml("a", [
            { id: "positive-direct", type: "positive", prompt: "p", expect: ['the output contains "ADR-0013"', "the emitted file architecture-brief.md exists", "the run returns exit code 0"] }
          ])
        })
      ]);
      const pos = this.run(positiveCorpus).filter((f) => f.verdict === VERDICT.UNDECIDABLE && f.file !== null);
      const neg = this.run(negativeCorpus).filter((f) => f.verdict === VERDICT.UNDECIDABLE);
      return {
        positive: {
          fired: pos.length > 0,
          detail: `expectations "the response is well-structured" and "facts and assumptions remain separated" produced ${pos.length} UNDECIDABLE finding(s) at lines ${pos.map((f) => f.line).join(", ")}`
        },
        negative: {
          fired: neg.length > 0,
          detail: `expectations naming a quoted literal, a file path, and an exit code produced ${neg.length} UNDECIDABLE finding(s)`
        }
      };
    }
  },

  {
    id: "evals.missing-eval-coverage",
    describe:
      "Reports a manifest that claims an evaluation suite which resolves to no file or directory in the package, or whose resolved suite states no cases, as a VIOLATION; a package that simply has no evals and claims none is reported as NO_EVIDENCE, since absence of evals is not itself a contradicted declaration.",
    run(corpus) {
      const facts = evalFacts(corpus);
      const out = unreadableFindings("evals.missing-eval-coverage", facts);

      for (const p of facts.packages) {
        const pkg = p.pkg;
        const claim = pkg.manifest ? pkg.manifest.values["evaluation.suite"] ?? null : null;
        const claimStr = typeof claim === "string" && claim.trim() !== "" ? claim.trim() : null;
        const claimLine = claimStr && pkg.manifestText ? lineOf(pkg.manifestText, /^\s*suite:/m) : null;

        const caseCount = p.casesFiles.reduce((n, cf) => n + cf.cases.length, 0);
        const evalPaths = p.evalFiles.map((f) => f.rel);

        // "No suite key was read" is not "no suite key exists". readShallowYaml
        // reports the lines it could not represent; if the manifest has any,
        // a missing claim is UNDECIDABLE, not absence.
        const manifestUnreadable = pkg.manifest ? pkg.manifest.unreadable : [];
        if (claimStr === null && manifestUnreadable.length > 0) {
          out.push(finding({
            check: "evals.missing-eval-coverage",
            pkg: p.name,
            file: `${p.name}/manifest.yaml`,
            line: manifestUnreadable[0].line,
            verdict: VERDICT.UNDECIDABLE,
            observation: `${p.name} has a manifest with no readable evaluation.suite key, but ${manifestUnreadable.length} manifest line(s) could not be read; whether an evaluation claim exists cannot be decided from this parse, and reporting it as absent would let the check pass on content it never read.`,
            evidence: {
              declaredSuite: null,
              unreadableManifestLines: manifestUnreadable.slice(0, 10).map((u) => u.line),
              unreadableManifestLineCount: manifestUnreadable.length,
              evalFiles: evalPaths,
              cases: caseCount
            }
          }));
          continue;
        }

        if (claimStr === null) {
          out.push(finding({
            check: "evals.missing-eval-coverage",
            pkg: p.name,
            file: pkg.manifestPath ? `${p.name}/manifest.yaml` : (evalPaths[0] ?? null),
            line: pkg.manifestPath ? (lineOf(pkg.manifestText, /^evaluation:/m) ?? 1) : (evalPaths[0] ? 1 : null),
            verdict: VERDICT.NO_EVIDENCE,
            observation: pkg.governed
              ? `${p.name} carries a manifest that declares no evaluation suite; ${p.hasEvals ? `${caseCount} case(s) exist under evals/ but nothing in the manifest claims them` : "no eval files are present"}. No declaration is contradicted, so this is absence of evidence, not a clean result.`
              : `${p.name} has no manifest, so it makes no evaluation claim this check could contradict; ${p.hasEvals ? `${caseCount} case(s) exist under evals/` : "no eval files are present"}. Absence of evals here is not adjudicable by this check.`,
            evidence: {
              governed: pkg.governed,
              declaredSuite: null,
              evalFiles: evalPaths,
              cases: caseCount
            }
          }));
          continue;
        }

        const normalisedClaim = claimStr.replace(/^\.\//, "").replace(/\/+$/, "");
        const candidate = `${p.name}/${normalisedClaim}`;
        const resolves = pkg.files.some((f) => f.rel === candidate || f.rel.startsWith(`${candidate}/`));

        if (!resolves) {
          out.push(finding({
            check: "evals.missing-eval-coverage",
            pkg: p.name,
            file: `${p.name}/manifest.yaml`,
            line: claimLine ?? 1,
            verdict: VERDICT.VIOLATION,
            observation: `${p.name} claims evaluation suite "${claimStr}", which resolves to no file or directory in the package (expected ${candidate}); the manifest asserts evaluation coverage the repository does not contain at the declared location.`,
            evidence: {
              criterion: "a declared evaluation suite must resolve to a file or directory inside the package",
              declaredSuite: claimStr,
              resolvedCandidate: candidate,
              evalFilesActuallyPresent: evalPaths,
              casesFoundElsewhereInPackage: caseCount
            }
          }));
          continue;
        }

        if (caseCount === 0) {
          out.push(finding({
            check: "evals.missing-eval-coverage",
            pkg: p.name,
            file: `${p.name}/manifest.yaml`,
            line: claimLine ?? 1,
            verdict: VERDICT.VIOLATION,
            observation: `${p.name} claims evaluation suite "${claimStr}", which resolves, but the suite states zero cases; the claimed coverage references nothing.`,
            evidence: {
              criterion: "a resolved evaluation suite must state at least one case",
              declaredSuite: claimStr,
              evalFilesActuallyPresent: evalPaths,
              cases: 0
            }
          }));
          continue;
        }

        out.push(finding({
          check: "evals.missing-eval-coverage",
          pkg: p.name,
          file: `${p.name}/manifest.yaml`,
          line: claimLine ?? 1,
          verdict: VERDICT.NO_EVIDENCE,
          observation: `${p.name} claims evaluation suite "${claimStr}", which resolves and states ${caseCount} case(s). This check confirms the claim resolves; it makes no statement about whether those cases can fail.`,
          evidence: { declaredSuite: claimStr, resolvedCandidate: candidate, cases: caseCount }
        }));
      }

      return out;
    },
    selfTest() {
      const cases = casesYaml("a", [{ id: "positive-direct", type: "positive", prompt: "p", expect: ["skill should trigger"] }]);
      const positiveCorpus = synthCorpus([
        synthPackage({ name: "a", cases, manifest: "name: a\nevaluation:\n  suite: evals/a\n" })
      ]);
      const negativeCorpus = synthCorpus([
        synthPackage({ name: "a", cases, manifest: "name: a\nevaluation:\n  suite: evals/cases.yaml\n" }),
        synthPackage({ name: "b", cases: null, manifest: null })
      ]);
      const pos = this.run(positiveCorpus).filter((f) => f.verdict === VERDICT.VIOLATION);
      const neg = this.run(negativeCorpus).filter((f) => f.verdict === VERDICT.VIOLATION);
      const negNoEv = this.run(negativeCorpus).filter((f) => f.verdict === VERDICT.NO_EVIDENCE);
      return {
        positive: {
          fired: pos.length > 0,
          detail: `a manifest claiming suite "evals/a" while only evals/cases.yaml exists produced ${pos.length} VIOLATION(s) at ${pos.map((f) => `${f.file}:${f.line}`).join(", ")}`
        },
        negative: {
          fired: neg.length > 0,
          detail: `a manifest claiming suite "evals/cases.yaml" that resolves with 1 case, plus an unmanifested package with no evals, produced ${neg.length} VIOLATION(s) and ${negNoEv.length} NO_EVIDENCE finding(s)`
        }
      };
    }
  }
];

// ---------------------------------------------------------------------------
// Synthetic corpus construction. IN MEMORY ONLY — selfTest fixtures never touch
// the filesystem, and nothing here can write under .agents/.
// ---------------------------------------------------------------------------

/** Renders a cases.yaml body from case objects, matching the corpus's shape. */
export function casesYaml(skill, cases) {
  const lines = [`skill: ${skill}`, "version: 0.1.0", "cases:"];
  for (const c of cases) {
    lines.push(`- id: ${c.id}`);
    if (c.type !== undefined) lines.push(`  type: ${c.type}`);
    if (c.prompt !== undefined) lines.push(`  prompt: ${c.prompt}`);
    if (c.expect !== undefined) {
      lines.push("  expect:");
      for (const e of c.expect) lines.push(`  - ${e}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function synthPackage({ name, cases = null, manifest = null, skill = null, extraFiles = [] }) {
  const files = [];
  const add = (rel, text) => files.push({
    rel,
    path: `<memory>/${rel}`,
    text,
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: "<memory>"
  });
  if (manifest !== null) add(`${name}/manifest.yaml`, manifest);
  if (skill !== null) add(`${name}/SKILL.md`, skill);
  if (cases !== null) add(`${name}/evals/cases.yaml`, cases);
  for (const [rel, text] of extraFiles) add(`${name}/${rel}`, text);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  return Object.freeze({
    name,
    dir: `<memory>/${name}`,
    files,
    digest: "<memory>",
    manifestPath: manifest === null ? null : `<memory>/${name}/manifest.yaml`,
    manifestText: manifest,
    manifest: manifest === null ? null : readShallowYaml(manifest),
    skillPath: skill === null ? null : `<memory>/${name}/SKILL.md`,
    skillText: skill,
    governed: manifest !== null
  });
}

export function synthCorpus(packages) {
  return Object.freeze({
    root: "<memory>",
    loadedAt: null,
    packages: Object.freeze(packages),
    counts: Object.freeze({
      packages: packages.length,
      governed: packages.filter((p) => p.governed).length,
      ungoverned: packages.filter((p) => !p.governed).length,
      files: packages.reduce((n, p) => n + p.files.length, 0)
    })
  });
}
