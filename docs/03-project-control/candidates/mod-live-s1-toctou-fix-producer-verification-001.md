# MOD-LIVE S1 — TOCTOU Fix (N1) Producer Self-Verification / Rework Record

**Record ID:** mod-live-s1-toctou-fix-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE (local commit only, not pushed, not merged)
**Producer:** claude-sonnet-main (BST-SA Motor/producer role), operating under AMD-002 rev 2 (advise-and-proceed)
**Date:** 2026-07-21
**Branch:** `bst/mod-live-s1-toctou-fix-001`
**Base:** `main` @ `332b7abee1663befffec473c641d91021ffdd10f` (verified via `git rev-parse main` at dispatch time)
**Worktree:** `C:/laragon/www/SecB-worktrees/bst-mod-live-s1-toctou-fix-001` (isolated, new)
**Target file:** `src/live/event-family-policy.mjs` (`assessEnvelopeConformance` only)
**Companion tests:** `tests/event-family-policy.test.mjs` (3 new regression tests appended)

**Cited finding:** N1 (MEDIUM), from the second independent review record
`docs/03-project-control/candidates/mod-live-s1-event-family-second-independent-review-001.md`
(reviewer `claude-rev-live-s1-002`, on local ref `refs/heads/bst/mod-live-s1-event-family-second-review-001` @
commit `7ae8e90`; that record's own review target was `bst/mod-live-s1-event-family` @
`c81c08e`, staged @ `fd3a31d`, already merged to `main` via PR #36 @ `adfeb8e`).

---

## Root cause

`assessEnvelopeConformance` iterated `DOCTRINE_CONFORMANCE_ELEMENTS` (8 doctrine-checked
fields, in a fixed, publicly-exported order: `trace_id, span_id, sequence,
prior_event_hash, fact_classification, content_capture_level, redaction_status,
evidence_candidate`) and, for each field, performed a **fresh** `Object.hasOwn` check
followed by a **fresh** property read (`envelope[spec.element]`) **at that exact point in
the loop**. Nothing prevented a getter invoked while reading an earlier field (e.g.
`trace_id`, checked first) from mutating the envelope as a side effect — deleting or
defining a **different**, later-checked field (e.g. `sequence` or `evidence_candidate`) —
before that later field was itself probed. This is a classic time-of-check-to-time-of-use
(TOCTOU) gap: presence for each field was decided from whatever state the live object
happened to be in when that field's turn arrived, not from a single consistent view of
the object taken once.

Both directions were reproduced against the pre-fix module, independently, in this
worktree, before any change was made (see Verification, below):

- **Deletion:** `sequence = 42` is genuinely present at call time. A getter on `trace_id`
  (checked first) has the side effect `delete envelope.sequence`. Result (pre-fix):
  `MISSING_SEQUENCE` is fabricated even though `sequence` was present when the caller
  invoked the function.
- **Injection:** `evidence_candidate` is never supplied by the caller. A getter on
  `trace_id` (checked first) has the side effect `envelope.evidence_candidate = true`.
  Result (pre-fix): `MISSING_EVIDENCE_CANDIDATE_FLAG` is suppressed even though the caller
  never supplied that field.

Both are inside the module's own stated threat model (defending against hostile,
adversarial envelope input) — the shipped suite already tested throwing getters, Proxy
traps, and a poisoned `Symbol.iterator` per-field, but never a getter with a side effect
on a *different* field.

Current blast radius was zero (the module is unwired — no live consumer of
`assessEnvelopeConformance`'s findings exists anywhere in the repo), which is why this
was MEDIUM/advisory rather than a blocking defect. It is being closed now, before any
S2/S3 slice reuses this exact sequential-iteration pattern (the second review record
explicitly names this as the reason to close pre-emptively) and before this evaluator is
ever wired into a live consumer.

## Correction

Rewrote `assessEnvelopeConformance`'s field loop as a two-pass, TOCTOU-safe read, keeping
the function's existing signature, house style (structured `{ ok, code, message }`
denials, deep-frozen output, single outer `try`/`catch`), and presence rule unchanged:

1. **Pass 1 — atomic snapshot.** For all 8 doctrine elements, in one uninterrupted loop
   (`DOCTRINE_CONFORMANCE_ELEMENTS.map(...)`), capture each element's own property
   descriptor via `Object.getOwnPropertyDescriptor(envelope, spec.element)`, **before any
   conditional logic or value read runs**. `Object.getOwnPropertyDescriptor` never invokes
   a getter — it only inspects property metadata (whether the property exists, and
   whether it is a data or accessor descriptor) — so **no getter runs during this pass**
   and no side effect can occur here.
2. **Pass 2 — decide from the snapshot only.** For each element, presence is decided from
   *that element's own* snapshotted descriptor, never from a fresh lookup on the live
   envelope:
   - Data descriptor: the value was already captured in the descriptor at snapshot time
     (`descriptor.value`) — no live re-read of the envelope at all.
   - Accessor descriptor: the getter is invoked **exactly once**, directly off the
     captured descriptor (`descriptor.get.call(envelope)`), rather than via a fresh
     `envelope[element]` lookup — this targets the exact function object captured at
     snapshot time regardless of what the live object looks like by the time this pass
     reaches that element.

Net effect: every element's presence is fixed by the state of the object at the single
instant the snapshot was taken (all 8 descriptors captured before any getter runs), not by
whatever the object happens to look like when that element's turn in the loop arrives. A
getter's side effect on a sibling element can no longer change that sibling's presence
determination, in either direction (deletion or injection).

This is option (a) from the fix brief (enumerate own properties once, up front, into a
plain snapshot, before any conditional logic), chosen because it is the most direct
translation of the existing `Object.hasOwn` + single-contained-read house style already
used in this file (and in `retry-policy.mjs` / `risk-registry.mjs`) — no new pattern was
invented.

**Invariants preserved:**
- Fail-closed extraction: each element's value is still read exactly once (invocation
  count of any getter is exactly 1; only now the read is sourced from the snapshotted
  descriptor rather than a fresh property lookup).
- The single outer `try`/`catch` around the whole function is unchanged; a throwing
  getter or a hostile `getOwnPropertyDescriptor`/Proxy trap during either pass still
  yields the `DENY_EVENT_ENVELOPE_MALFORMED` structured denial, never a throw.
- The presence rule (own property, non-null, non-undefined) is unchanged.
- The event is never mutated by the assessor itself (unchanged; the mutation in the
  regression tests comes from the *caller-supplied hostile getter*, not from the
  assessor).
- Output shape, frozen-output guarantees, and all deny codes are unchanged. No new
  export was added.
- Behavior for ordinary (non-getter) envelopes is byte-for-byte identical to before: a
  plain data property's snapshotted value equals what `envelope[element]` would have
  returned anyway, so every existing test's expected outcome is unchanged (confirmed —
  see Verification).

## Verification

### Pre-fix reproduction (both exploits confirmed present before any change)
Standalone script (`scratch-probe-pre.mjs`, deleted after use, never committed) run
against the module exactly as it stood on `main` at the start of this task:
- Deletion exploit: `MISSING_SEQUENCE` fabricated (present in findings) despite
  `sequence` being genuinely present at call time. **Reproduced.**
- Injection exploit: `MISSING_EVIDENCE_CANDIDATE_FLAG` suppressed (absent from findings)
  despite the caller never supplying `evidence_candidate`. **Reproduced.**

### Post-fix reproduction (same script, same exploits, re-run against the fixed module)
- Deletion exploit: `MISSING_SEQUENCE` **no longer appears**; `sequence`'s presence is
  correctly decided from the atomic snapshot taken before the `trace_id` getter ran.
  **Closed.**
- Injection exploit: `MISSING_EVIDENCE_CANDIDATE_FLAG` **correctly appears**;
  `evidence_candidate`'s absence at snapshot time is preserved regardless of the later
  injection. **Closed.**

### Committed regression tests (permanent, in `tests/event-family-policy.test.mjs`)
Both reviewer exploits, plus a non-adversarial control case, were committed as permanent
regression tests (section "4a. N1 TOCTOU regressions"):
- `N1 regression: a getter on an earlier-checked field cannot delete a later-checked
  field out of the result (deletion exploit)` — asserts `MISSING_SEQUENCE` is absent and
  confirms (via a sanity flag) that the hostile getter did run.
- `N1 regression: a getter on an earlier-checked field cannot inject a later-checked
  field to suppress its finding (injection exploit)` — asserts
  `MISSING_EVIDENCE_CANDIDATE_FLAG` is present and confirms the hostile getter did run.
- `N1 regression: control case` — same envelope shapes without the hostile getter, pinning
  down that ordinary presence/absence determinations are unchanged by the fix.

### Test counts

**Module suite (`tests/event-family-policy.test.mjs`), `node --test`:**
| | tests | pass | fail |
|---|---|---|---|
| Before (base `main` @ `332b7ab`, pre-fix) | 26 | 26 | 0 |
| After (this branch, post-fix + 3 new tests) | 29 | 29 | 0 |

**Full repo suite (`npm test`):**
| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Before (base `main` @ `332b7ab`, pre-fix, fresh `npm install`) | 843 | 838 | 0 | 5 |
| After (this branch, post-fix) | 846 | 841 | 0 | 5 |

Delta is exactly +3 tests, all passing, zero regressions anywhere in the 843-test
pre-existing baseline (every one of those 843 still passes unchanged after the fix).

### Hardcoded test-ID branching
`grep`-searched `src/live/event-family-policy.mjs` for test-ID / special-casing patterns
(`test.?id`, `testId`, `TEST_ID`, `NODE_ENV === "test"`, `__TEST__`, and generic
string-literal equality branches outside the pre-existing `typeof`/`status` checks).
**None found.** The fix branches only on descriptor shape (`Object.hasOwn(descriptor,
"value")`, `typeof descriptor.get === "function"`) — universal JS property-descriptor
mechanics, not on any caller identity or test fixture.

### Scope check
`git diff --stat` against this branch's base: exactly 2 files changed —
`src/live/event-family-policy.mjs` (+51/-5 net) and `tests/event-family-policy.test.mjs`
(+97 new lines, purely additive). No other file touched. Still PURE (no new imports,
`Date.now`/`Math.random`/`fetch`/`fs`/`process`/etc. grep unaffected — the change is
entirely built from `Object`/`Reflect`-level property-descriptor primitives already
available in the language) and still fully UNWIRED (no new export, no consumer added;
`git grep` for the module's exports outside its own two files still matches only
`MANIFEST.json` and review-doc prose).

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-sonnet-main
  peer_agent_id: n/a (no peer review dispatched for this bounded fix; independent REV recommended before merge)
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

Both of the second review's N1 exploits (deletion and injection) are closed, reproduced
first-hand pre-fix and post-fix by this producer, with permanent regression tests
committed alongside the fix. This is a local commit on `bst/mod-live-s1-toctou-fix-001`,
based on current `main` @ `332b7ab`. Not pushed, no PR opened, no merge — per AMD-002 rev
2 advise-and-proceed, this candidate is prepared and ready for asynchronous GOV
ratification at operator merge review; it carries no authority to self-declare complete
or production.
