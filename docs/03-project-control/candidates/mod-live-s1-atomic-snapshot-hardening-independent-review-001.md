# Independent Review 001 — Atomic-Snapshot Hardening (`cc63e9a`)

**Reviewer identity:** `claude-rev-sec-atomic-snapshot-01`
**Role:** REV/SEC (independent, advisory only)
**Target commit:** `cc63e9a07554e60fbadff1105bc3ccc205140a4f`
(`[ATOMIC-SNAPSHOT-HARDENING] Fold onto post-#41/#42/#43 main: N2+L1+F3 closure`)
**Parent:** `c85de6dab78882496b8622508aadb1112894cf05`
**Primary file under review:** `src/live/event-family-policy.mjs` (`assessEnvelopeConformance`)
**Secondary file (lighter pass):** `src/control/workspace-lease-policy.mjs`
**Relationship to prior review:** This is an INDEPENDENT review. It does not
supersede, and was produced without reliance on, the prior
`claude/rev/atomic-snapshot-regate` branch (commit `1ebf389`,
`atomic-snapshot-regate-001.md`), which gated the same commit from a fold-integrity
/ immune-procedural angle. This review re-derives the Proxy-semantics analysis
from first principles and via novel adversarial probes not present in that
prior gate's harness.
**Date:** 2026-07-21

## Verdict

**REQUEST_CHANGES**

The commit's own claim ("closes the cross-field TOCTOU class... N2 CLOSED") is
**overbroad**. The single upfront `Reflect.ownKeys` snapshot genuinely closes
the KEY-PRESENCE channel (N1's original getter-deletes-sibling attack, and
N2's `getOwnPropertyDescriptor`-trap variant, are both verifiably closed — see
§2 and §3). But the fix does **not** close, and does not even attempt to
close, a **VALUE-mutation** channel through the same iteration structure: because
`DOCTRINE_CONFORMANCE_ELEMENTS` is walked in a fixed order and each field's
*value* is read one at a time as its turn comes (not snapshotted upfront the
way keys are), an earlier field's getter/`get`-trap side effect can still
mutate a **later** field's stored value before that later field is read —
and this reliably flips the later field's finding (fabricates an absence,
or suppresses a genuine one). This is demonstrated below with a **plain
object using an ordinary accessor property — no Proxy required** (§1, PoC A/B),
and confirmed with an equivalent Proxy `get`-trap variant (§1, PoC C). The
module's own doc comment narrows its claim to "cannot fabricate or suppress a
sibling's **key-presence**" (line 261–264 of the reviewed file) — that
narrower claim is true, but it is not the claim the commit message and the
higher-level doc comment ("closes the cross-field TOCTOU class") actually make,
and the distinction is exactly the gap that lets a real exploit through.

This is not a request to re-litigate N1/N2 as reopened — those two specific
mechanisms are genuinely dead. It is a request to fix (or explicitly, honestly
scope-limit) a **third, newly-identified** cross-field TOCTOU vector — call it
**N3** — before this can be called "the cross-field TOCTOU class" closed.
Given the module remains PURE + UNWIRED (no live blast radius today, confirmed
unchanged by this diff), this is not a release-blocking production issue, but
it is a **correctness/labeling defect in a hardening commit whose entire stated
purpose is closing this exact class of bug**, so REQUEST_CHANGES rather than
APPROVE_WITH_NOTES.

---

## 1. Novel adversarial probes (this review's own harness, not reused from prior gates)

All four probes below were run against `assessEnvelopeConformance` as it
exists on `cc63e9a`, in an isolated worktree (`git worktree add --detach`,
never touching the live `bst/atomic-snapshot-hardening` branch).

**PoC A — plain-object getter suppresses a genuinely-absent sibling's finding
(no Proxy).** `trace_id` is a real accessor property (`Object.defineProperty`,
plain object, not a Proxy). `span_id` starts as an own property with value
`null` (correctly "absent" under the presence rule). `trace_id`'s getter, when
read (trace_id is iterated first in `DOCTRINE_CONFORMANCE_ELEMENTS`), sets
`envelope.span_id = "FORGED-BY-TRACE-ID-GETTER"` as a side effect, before
`span_id`'s own turn in the loop.
**Result: `MISSING_SPAN_ID` is silently absent from findings.** A field that
was never genuinely supplied is reported present.

**PoC B — plain-object getter fabricates a spurious finding for a genuinely-present
sibling (no Proxy).** Mirror of A: `span_id` starts as a real, genuinely-supplied
value (`"genuinely-supplied-span-id"`). `trace_id`'s getter sets
`envelope.span_id = null` before `span_id`'s turn.
**Result: a spurious `MISSING_SPAN_ID` finding is fabricated** for a field the
caller actually supplied.

**PoC C — Proxy `get`-trap equivalent of A.** A Proxy whose `get` trap, when
invoked for `trace_id`, mutates the *underlying target's* `span_id` value
before `span_id` is read later in the same loop (the Proxy's own `ownKeys` /
`getOwnPropertyDescriptor` traps are honest pass-throughs — this isolates the
`get`-trap-only vector). **Result: identical to A** — `MISSING_SPAN_ID` silently
absent.

**PoC D — control, confirms N1's original mechanism (key inject/delete) is
genuinely closed.** `trace_id`'s getter both `delete`s a sibling key
(`evidence_candidate`, already captured present in the `Reflect.ownKeys`
snapshot) and injects a brand-new key (`span_id`, not in the snapshot) on the
underlying object, mid-iteration.
Result, confirming the fix's real guarantee: the **injected** key `span_id`
still correctly reports `MISSING_SPAN_ID` (injection after the snapshot cannot
fabricate presence — N1 closed for injection). But note the **deleted** key
`evidence_candidate` *also* now reports as absent (`MISSING_EVIDENCE_CANDIDATE_FLAG`)
even though it was genuinely present at snapshot time — because, exactly as in
A/B/C, its *value* is still read fresh at its own later loop turn, by which
time `trace_id`'s getter has already deleted it. This is the same N3 value-channel
gap, reachable via delete instead of overwrite.

**PoC E — `has` trap usage.** A Proxy with an instrumented `has` trap, run
through `assessEnvelopeConformance`, fires the `has` trap **zero** times.
`has` (the `in` operator, `Reflect.has`) is not used anywhere in this function
or in `classifyEventType`'s single `Object.hasOwn(input, "eventType")` call
(which is a different, unrelated own-property check on a different object
shape and fires once regardless). Confirmed: not a live vector here.

**PoC F — non-adversarial behavior preserved.** Fully-populated conformant
envelope → zero findings, `ok:true`. Minimal 13-field schema-valid envelope →
all 8 doctrine findings, `ok:true` (the documented G1 gap-surfacing behavior,
not an error). Empty object → all 8 findings. `null` / array / string envelope
→ `DENY_EVENT_ENVELOPE_MALFORMED`, never a throw. All match documented/expected
behavior — the fix is behavior-preserving for ordinary inputs.

Reasoning through Proxy trap semantics independently (not just testing)
confirms why A–D happen: `Reflect.ownKeys` truly fires the `ownKeys` trap
exactly once and that return value is what `Set` membership is built from —
nothing later can add/remove from that `Set`. But `Reflect.ownKeys` says
**nothing about property values**; `envelope[spec.element]` inside the loop
is an ordinary `[[Get]]`, fired fresh, one per field, **at the time that
field's loop iteration runs** — which is strictly after every *earlier*
field's `[[Get]]` (and any side effect it triggered) has already completed.
Because `DOCTRINE_CONFORMANCE_ELEMENTS` order is fixed and public
(`trace_id, span_id, sequence, prior_event_hash, fact_classification,
content_capture_level, redaction_status, evidence_candidate`), any hostile
input knows exactly which field to weaponize to reach which later sibling.

None of A–D are exercised by the existing `tests/event-family-policy.test.mjs`
suite — its N2-labeled tests (`getOwnPropertyDescriptor`-trap inject/delete,
single-`ownKeys`-invocation) all test the KEY-PRESENCE channel the fix actually
closes; none construct a `get`-trap or plain-getter side effect that targets a
*different* field's *value*. Confirmed by direct grep of the test file (no
`get(` trap definitions with cross-field writes, no plain-getter
`Object.defineProperty` fixtures with side effects on a sibling).

## 2. Original N1 exploit (getter deletes/injects sibling KEY) — genuinely closed

Re-run directly (PoC D, injection half): a hostile getter injecting a new key
mid-iteration cannot make that key count as present, because
`Reflect.ownKeys` was captured before the loop began. Confirmed CLOSED for the
KEY-PRESENCE decision specifically (not for the value read that follows it —
see §1).

## 3. N2 exploit (Proxy `getOwnPropertyDescriptor`-trap side effect) — genuinely closed

`assessEnvelopeConformance` on `cc63e9a` contains **zero** executable calls to
`Object.getOwnPropertyDescriptor` / `Reflect.getOwnPropertyDescriptor` (the
three occurrences of the string in the file are all in comments). A Proxy
whose `getOwnPropertyDescriptor` trap throws, or whose trap has a side effect,
is never invoked at all by this function — there is no code path left that
would fire it. Confirmed CLOSED; this matches both the commit's claim and the
prior regate's independent empirical finding.

## 4. `has` trap — not used, not a vector

See PoC E above. `has`/`Reflect.has`/`in` do not appear in
`assessEnvelopeConformance`'s or `classifyEventType`'s logic. Not exploitable
because not invoked.

## 5. Behavior preservation for ordinary envelopes

See PoC F above. Confirmed unchanged from documented behavior for well-formed,
malformed, minimal, empty, and non-object inputs.

## 6. Test suite

- `tests/event-family-policy.test.mjs` run in isolation: **29/29 pass**, 0
  failures. All existing N1/N2/L1 regression tests pass; none of them cover
  the N3 gap identified in §1 (confirmed by inspection, not just by the green
  run).
- Full repo suite (`npm test`, after `npm install` in the isolated worktree —
  the worktree had no `node_modules`): **961 tests, 955 pass, 1 fail, 5
  skipped.** The 1 failure is
  `tests/write-set-policy.test.mjs`'s "byte-identity: files read but not
  modified are unchanged vs main @ 71b9d41" guard, which fails because it
  dynamically diffs the checked-out working tree against the **live, moving**
  `main` branch ref (`git rev-parse main:<path>`) rather than a pinned commit —
  and `main` has advanced past `cc63e9a` since this commit was authored,
  modifying `tools/validate-foundation.mjs` in later, unrelated work.
  Verified `git diff cc63e9a^ cc63e9a -- tools/validate-foundation.mjs` is
  **empty**: `cc63e9a` itself never touched that file. This failure is an
  artifact of independently reviewing a historical commit in isolation against
  today's `main`, not a regression introduced by `cc63e9a`. (The prior regate's
  961/956/0/5 all-green result was obtained when `main` had not yet advanced
  past this commit's parent lineage.)
- `npm run validate`: passes (invoked as part of `npm test`'s pretest step,
  prior to the one unrelated failure above).

## 7. Hardcoded test-ID branching / shortcuts

Grepped `src/live/event-family-policy.mjs`, `src/control/workspace-lease-policy.mjs`,
and both test files for test-ID branching, environment-conditional logic, or
special-cased shortcuts (`test-id`, `testId`, `TEST_ID`, `__test`,
`process.env.NODE_ENV`, ad hoc `if (... === <literal test value>)`, etc.).
**None found.** Both source files are ordinary pure functions with no
environment or identity branching.

## 8. Secondary note — `workspace-lease-policy.mjs` (`readFields`, lighter pass)

Not the primary scope of this review, but flagged for completeness since the
same commit touches this file for F3: `readFields(source, keys)`
(`src/control/workspace-lease-policy.mjs:92`) reads `leaseId, sessionId,
actorId, writeSet, issuedAt, ttl` in a fixed sequential loop
(`out[key] = source[key]`) with no upfront key-set snapshot at all (unlike
the event-family fix, there was never a "presence" decision to protect here —
these are plain field pass-throughs, not doctrine-absence findings). The same
structural pattern (an earlier field's getter could mutate a later field's
value before its read) is present, but since none of these fields currently
gate an absence/presence decision the way `DOCTRINE_CONFORMANCE_ELEMENTS`
does, the practical impact is materially different (value-substitution of a
pass-through field vs. fabricating/suppressing a security-relevant finding).
The F3-specific claim in the commit ("value-varying index getter read once;
stored === validated") is about `snapshotArray`'s per-index array handling and
is independently verified correct — that specific claim is not affected by
this note. Recommend the same order-of-read scrutiny be applied here in a
follow-up if `readFields`'s output is ever used for a cross-field consistency
check.

---

## Recommended remediation (not prescriptive — operator/producer's call)

The narrowest fix consistent with the module's existing "single contained
read" discipline: snapshot each field's **value** (not just the key set) in
the same single pass that already captures `Reflect.ownKeys`, e.g. read every
`envelope[spec.element]` for every `spec` whose key is present, in the SAME
loop that determines presence, before any later field's read can be
influenced by an earlier field's side effect — or explicitly document (with
the same honesty as the current L1 disclosure) that per-field values are
NOT mutually isolated and that this is an accepted residual, if the module's
threat model considers cross-field value substitution out of scope. Either
resolution is legitimate; what is not acceptable is the current commit's
unqualified claim to close "the cross-field TOCTOU class."

## Advisory status fields

- `truth_status`: verified_false (re: the commit's "closes the cross-field
  TOCTOU class" / unqualified "N2 CLOSED" framing — the narrower KEY-PRESENCE
  claim is `verified_true`; the broader claim is not)
- `authority_status`: advisory_only
- `implementation_status`: partial
- `risk_class`: medium (no live blast radius today — module is PURE + UNWIRED,
  confirmed unchanged by this diff — but the defect is real, reproducible with
  a plain getter with no Proxy required, and directly contradicts this
  hardening commit's stated purpose)

## Authority

This is an advisory REV/SEC review. It does not authorize merge, does not
declare production, and does not self-authorize execution. Merge remains an
operator action. This review does not touch, rebase, or push to the live
`bst/atomic-snapshot-hardening` branch; it is committed from an isolated
detached-HEAD worktree via `git update-ref` onto a dedicated review ref.

```yaml
self_certification:
  agent_id: claude-rev-sec-atomic-snapshot-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
