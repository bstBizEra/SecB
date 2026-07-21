# MOD-LIVE S1 — SECOND, Independent Review: Event-family classifier + envelope-doctrine conformance evaluator

**Record ID:** mod-live-s1-event-family-second-independent-review-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Reviewer:** claude-rev-live-s1-002 (BST-SA REV role, independent — no relationship to the producer or to the first reviewer)
**Date:** 2026-07-21
**Review target:** branch `bst/mod-live-s1-event-family` @ `c81c08e5b1b3f2fc1cd2b9c54ec7e8a480ebe7ab`, as staged on `origin/bst/mod-live-s1-event-family-staged` @ `fd3a31d84fbacba20121e6cc273c8294f14d0fbf`
**Base:** unified `main` @ `280d32c5b0c2067ae55907cb3ff580aad5688a76`
**Relationship to prior record:** this is a **SECOND, independent** re-verification. It is distinct from, and does not simply confirm, `5e5e2db`'s own review (`docs/03-project-control/candidates/mod-live-s1-event-family-rev-001.md`, verdict `APPROVE_FOR_MERGE`). All checks below were reproduced first-hand in a fresh isolated worktree without relying on the first reviewer's reported numbers, and the adversarial-probe phase specifically targeted behavior the first reviewer's own record does not mention.
**Authoritative spec:** `docs/03-project-control/candidates/mod-live-gap-assessment-001.md` (`bst/mod-live-assessment` @ `688fda5`) — Slice S1, gap G1, boundaries B1–B7, non-goals §5.
**Note on current state:** at the time of this review, `origin/main` (`adfeb8e5…`) already contains this candidate — it was merged via PR #36 (`bst/mod-live-s1-event-family-staged` → `main`) prior to this second review being dispatched. This review evaluates the candidate's own merits and is written as a post-hoc / confirmatory second opinion; it does not change the fact that the merge has already occurred, and it carries no authority to revert it.

**Method:** All findings below were reproduced first-hand, independently, in a detached-HEAD worktree at `origin/bst/mod-live-s1-event-family-staged` (`fd3a31d`), separate from any other agent's checkout of `bst/mod-live-s1-event-family` (which remains checked out elsewhere and was not touched). `npm install` + `npm test` were run fresh (no reuse of prior `node_modules`). Source was read in full, line by line. A standalone adversarial probe script (`scratch-probe.mjs` / `scratch-probe2.mjs`, both deleted after use, never committed) exercised novel edge cases against the built module directly via `node`, independent of and in addition to the shipped test suite.

---

## Verdict: APPROVE_WITH_NOTES

Every scope, purity, wiring, doc-parity, and regression claim made by the producer and by the first reviewer was independently reproduced and holds. However, adversarial probing found one genuine, reproducible, previously-unflagged behavioral gap in `assessEnvelopeConformance` (N1 below): the evaluator does not snapshot the envelope's field presence atomically before iterating, so a self-mutating envelope (a getter on one doctrine-checked field that has a side effect on a sibling doctrine-checked field) can deterministically suppress or fabricate individual findings, in either direction, and the exact check order that makes this exploitable is public (the module exports `DOCTRINE_CONFORMANCE_ELEMENTS` in that literal order). This sits squarely inside the module's own stated threat model (defending against hostile/adversarial envelope input) and was not caught by the first review's per-field-only adversarial probes (which tested throwing getters/proxy traps on one field at a time, never a getter with a side effect on a *different* field).

Given the module is genuinely **PURE and UNWIRED** (independently reconfirmed — zero importers anywhere in the repository outside its own two files), the current blast radius of N1 is zero: nothing consumes `assessEnvelopeConformance`'s output today, so nothing can be fooled by it yet. That is why this is APPROVE_WITH_NOTES rather than REQUEST_CHANGES — the candidate's stated scope and every acceptance check the assessment demanded are genuinely met. But N1 is a real defect in exactly the fail-closed-extraction discipline this slice claims to establish "mirrors MOD-GOV S2 / MOD-RUNTIME S2 doc-parity discipline" and that S2/S3 are explicitly planned to reuse ("house style throughout... Fail-closed extraction... every property read... is a single contained read"). It should be closed **before** S2/S3 are produced on top of the same pattern, and definitely before `assessEnvelopeConformance`'s findings are ever wired into anything that acts on them (a report, a gate, an alert).

---

## Findings by severity

**CRITICAL:** none.
**HIGH:** none.

**MEDIUM**
- **N1 (novel) — `assessEnvelopeConformance` has no atomic presence snapshot; sibling-field getter side effects can suppress or fabricate individual findings, order determined by the (exported, public) `DOCTRINE_CONFORMANCE_ELEMENTS` order.**
  The function loops `for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS)` and, for each `spec`, does a fresh `Object.hasOwn(envelope, spec.element)` + one contained read *at that point in the loop*. Nothing prevents a getter invoked for an earlier element in the fixed order (`trace_id, span_id, sequence, prior_event_hash, fact_classification, content_capture_level, redaction_status, evidence_candidate`) from mutating the envelope object as a side effect — e.g. deleting or defining a *later* element — before that later element is itself probed.
  Reproduced two ways in an isolated script (not part of the shipped suite):
  - **Deletion:** an envelope has `sequence = 42` set (present at call time). A getter on `trace_id` (checked first) has the side effect `delete envelope.sequence`. Result: `assessEnvelopeConformance` reports `MISSING_SEQUENCE` even though `sequence` was genuinely present on the object at the moment the caller invoked the function.
  - **Injection:** an envelope never sets `evidence_candidate` (checked last). A getter on `trace_id` has the side effect `envelope.evidence_candidate = true`. Result: `MISSING_EVIDENCE_CANDIDATE_FLAG` does **not** appear in the findings, even though the caller never supplied that field.
  Both were reproduced against the committed module exactly as shipped (`src/live/event-family-policy.mjs` @ `c81c08e`/current `main`), with a plain control case (no getters) confirming the baseline behavior is otherwise correct.
  **Why this matters despite UNWIRED status:** the module's entire design philosophy (and the WSPACE-S1 "fail-closed extraction" lesson it explicitly invokes) is built around defending against exactly this class of hostile-input manipulation — the shipped suite already tests throwing getters, Proxy traps, and a poisoned `Symbol.iterator`, all *per field*. This is the same threat model, just applied across fields instead of within one. Because `DOCTRINE_CONFORMANCE_ELEMENTS` is a public export whose order is part of the module's documented contract, an adversarial envelope author does not need to guess the check order — it is fully discoverable by reading the module.
  **Why MEDIUM, not HIGH:** `classifyEventType` is unaffected (single-field, no cross-field surface). `assessEnvelopeConformance` is UNWIRED — no current consumer relies on or acts on its findings, so no live decision can be manipulated today. This is a latent robustness gap, not an active exploit.
  **Suggested remediation (not required for this slice's own stated scope, but should gate any future wiring or S2/S3 reuse of this iteration pattern):** capture an atomic snapshot of which of the 8 elements are present — e.g. `Object.getOwnPropertyDescriptors(envelope)` once, up front, before invoking any getter — and compute all eight `hasOwn` determinations from that single synchronous snapshot before reading any value. This removes the sequential-read TOCTOU window entirely. A cheaper partial mitigation (not fully sufficient, but worth noting) would be to at least document the exposure since the check order is intentionally exported.

**LOW**
- **L1 (independently reconfirmed, not new) — doc-parity test title over-states coverage direction.** Same finding as the first review's L1: `"doc-parity: assessed elements are exactly the doctrine elements ABSENT from the minimal live schema"` only asserts the subset direction. Confirmed still accurate; no new angle to add. Cosmetic.

**INFORMATIONAL**
- **I1 (independently reconfirmed) — conformance assessor covers a documented, non-exhaustive subset of the doctrine's "Requirements" list** (host/process identity, runtime version, normalized-payload/provider-native reference, several session/deployment IDs, and the "signature reference" half of the payload-hash bullet are not surfaced as findings). Matches G1's explicit "e.g." framing and the module's own docstring; not a defect.
- **I2 (independently reconfirmed) — whitespace-padded event types fail closed as UNKNOWN, not MALFORMED** (`" session.start "` → family parses as `" session"`, unmapped, denied). Fail-closed and safe; no functional issue.
- **I3 (new, informational only) — the classifier validates only that a dot exists and is neither leading nor the single trailing character; it does not validate the "name" segment after the first dot at all.** `"tool.."` classifies as `{ok:true, family:"tool"}` (the "name" part is the degenerate string `"."`), and `"tool...................."` would classify identically. This is consistent with the classifier's stated single job (family prefix only, one plane above schema/shape validation, B6) — the live schema itself places no format constraint on `event_type` beyond `minLength:1` — so this is not a boundary violation, just worth naming explicitly since it was not called out in the first review.
- **I4 (new, informational only) — `assessEnvelopeConformance` accepts any non-null, non-array `typeof === "object"` value as an "envelope," including exotic types (`Map`, `Date`, `Promise`, class instances, generator results, etc.), not just plain data objects.** A `Map` with a `.set("trace_id", "x")` entry is *not* detected as carrying `trace_id` (Map entries are not object properties), so it silently reports all 8 elements missing rather than rejecting the input as the wrong shape. This is fail-closed in effect (no finding is ever wrongly suppressed by passing a Map), but it means "malformed" detection is narrower than "is this actually envelope-shaped" — consistent with the module's stated non-goal of re-validating shape (B6), so not a defect, just a note for anyone tempted to pass richer objects through this function later.
- **I5 — repository/PR state note.** As of this review, the staged branch has already been merged to `main` (PR #36, `adfeb8e`). This review was conducted against the merged content (verified identical to `c81c08e`'s 3-file diff) and is offered as a post-merge second opinion; it carries no reversal authority.

---

## Verification detail (independently reproduced, not copied from the first review)

### 1. Scope / byte-identity / schema (B6)
- `git diff 280d32c c81c08e --stat` → exactly 3 files: `MANIFEST.json` (+2/-1 net-append), `src/live/event-family-policy.mjs` (263 new LOC), `tests/event-family-policy.test.mjs` (471 new LOC). **PASS**, matches producer and first reviewer.
- `git diff main..HEAD --stat` at the current staged-branch tip (`fd3a31d`) vs current `main` (`adfeb8e`) → **empty** (this worktree's HEAD tree is identical to `main`'s tree; `main` has already absorbed this candidate via PR #36's merge). Confirms no drift/corruption occurred in the intervening folds.
- `git diff 280d32c..main -- MANIFEST.json` shows a clean append-only history across the intervening merges (S1's two new file paths land alongside unrelated slices' entries added later; no line ever removed). **PASS.**
- `contracts/event-envelope.schema.json` independently re-read in full: `additionalProperties: false`, `required` and `properties` both list exactly the same 13 fields (no schema-side "declared in properties but not required" no-op gap exists — checked specifically per this review's mandate to hunt for that bug class; it does not apply here since the module makes no schema edits and the schema itself has no such gap). **PASS.**

### 2. PURE claim
- `grep -nE "Date\.now|Math\.random|readFile|writeFile|require\(|import |process\.|fetch\(|setTimeout|setInterval|fs\.|crypto\."` against `src/live/event-family-policy.mjs` → **zero matches**. The module has no imports at all. **PASS**, independently confirmed (not just re-asserted from the producer's claim).

### 3. UNWIRED claim
- `git grep -n "event-family-policy|classifyEventType|assessEnvelopeConformance|EVENT_FAMILIES|DOCTRINE_CONFORMANCE_ELEMENTS"` at current `main` tip, excluding the module's own two files → matches only `MANIFEST.json` (manifest listing) and the two review docs' prose. **Zero code importers anywhere in `src/**`/`tools/**`/other tests.** **PASS.**

### 4. Doc-parity / doctrine sourcing
- `docs/05-live-operations/event-envelope.md` read in full. The 19-entry "Event Families" fenced list matches `EVENT_FAMILIES` 1:1, in order. Each of the 8 `DOCTRINE_CONFORMANCE_ELEMENTS[].doctrine` phrases is a verbatim substring of the doc's "Requirements" bullets (independently grepped against the actual doc text, not taken on faith). **PASS.**

### 5. Regression (this worktree, fresh install)
- `npm install` (fresh `node_modules`, only dependency is `ajv`/`ajv-formats`) then `npm test` at the staged-branch tip (`fd3a31d`, which is main-equivalent): **814 tests / 809 pass / 0 fail / 5 skipped.** (This total differs from the first reviewer's 760/755/0/5 because the staged branch tip has folded in additional, unrelated slices merged after `c81c08e` — MOD-RUNTIME completion, approval-binding rework, etc. — not because of any regression in this candidate. The `event-family-policy.test.mjs` file's own 26 tests are unchanged and pass.)
- `node tools/validate-foundation.mjs` → `"status": "PASS"`, exit 0. **PASS.**

### 6. Adversarial probing beyond the shipped suite and beyond the first review
Executed via standalone script, not part of any committed test:
- Family-prefix substring confusion (`sub.foo` vs `subagent.*`, `agent.foo` vs `agents.foo`) → correctly distinguished, no confusion, unmapped prefixes denied `DENY_EVENT_FAMILY_UNKNOWN`. **PASS.**
- Full-width Unicode dot (`session．started`) → denied `DENY_EVENT_TYPE_MALFORMED` (no ASCII dot found). **PASS.**
- Combining-diacritic confusable (`sessión.start`) → denied `DENY_EVENT_FAMILY_UNKNOWN`, not conflated with `session`. **PASS.**
- Double leading dot (`..started`) → malformed. Double/trailing internal dots (`session..started`, `tool..`) → classify by first prefix only (see I3; not a defect, informational). **PASS / see I3.**
- 100,000-character unmapped prefix → denies in <1ms, no perf cliff, no crash. **PASS.**
- Duck-typed array-like object (`{eventType, length, 0:"x"}`, not a real `Array`) → classifies normally, extra properties ignored. **PASS.**
- Numeric-looking prefix (`123.456`) → denied unknown, no numeric coercion path. **PASS.**
- Empty object as envelope → surfaces all 8 findings, does not throw, does not silently skip any. **PASS.**
- `EVENT_FAMILIES` / `DOCTRINE_CONFORMANCE_ELEMENTS` mutation attempts (`.push`) → both throw `TypeError` (frozen), independently reconfirmed. **PASS.**
- **Cross-field getter side effects (deletion and injection variants)** → see **N1** above. This is the one adversarial probe that surfaced behavior the first review's own record does not mention or test.

---

## Comparison with the first review (`5e5e2db`)

The first review's verification was thorough and every one of its PASS claims was independently reproduced here with no discrepancy (byte-identity hashes, doc-parity, 19-family coverage, per-field accessor-attack regressions, frozen-output checks, merge-cleanliness). Its L1 and I1/I2 observations are accurate and are reconfirmed above rather than re-derived independently, since re-deriving them would add no information.

What this second review adds that the first review's own record does not contain:
- **N1** — the cross-field, order-dependent presence-manipulation gap in `assessEnvelopeConformance`, which is a genuine finding at the MEDIUM level, not previously flagged.
- **I3** — explicit naming of the fact that the classifier does not validate the "name" segment's shape beyond non-emptiness (informational, not a defect, but not stated by the first reviewer).
- **I4** — explicit naming of the fact that the assessor accepts any object-typed value, including exotic non-plain-object types like `Map`/`Date`/`Promise`, as an "envelope" (informational, not a defect).
- **I5** — the observation that the candidate has, in the time since the first review, already been merged to `main` via PR #36 — relevant repository-state context the first review (dated before that merge) could not have recorded.

---

## Advisory status fields

```yaml
truth_status: verified_true            # every claim reproduced first-hand in a fresh isolated worktree; N1 independently reproduced twice (deletion + injection variants) against the committed module
authority_status: advisory_only
implementation_status: existing        # S1 code exists on main (already merged via PR #36) as reviewed
risk_class: low                        # pure, unwired, additive; N1 is a real but currently-inert robustness gap (zero live consumers)
self_certification:
  agent_id: claude-rev-live-s1-002
  peer_agent_id: claude-immune-rev-live-s1-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Independent review verdict is advisory. This record recommends APPROVE_WITH_NOTES; it does not merge, push, or authorize activation, and it carries no authority to reverse the PR #36 merge that has already occurred. N1 should be tracked and closed before `assessEnvelopeConformance` is wired into any consumer, and before S2/S3 (which explicitly plan to reuse this module's iteration/fail-closed-extraction house style) are produced, so the same gap is not propagated forward.
